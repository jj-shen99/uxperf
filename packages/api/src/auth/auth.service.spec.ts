import { Test } from "@nestjs/testing";
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { DatabaseService } from "../database/database.service";

describe("AuthService", () => {
  let service: AuthService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  // -- Register --
  describe("register", () => {
    it("creates a new user with hashed password", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // email check
        .mockResolvedValueOnce({
          rows: [{ id: "u-1", email: "a@b.com", display_name: "Alice", role: "viewer" }],
        }); // insert
      const result = await service.register({
        email: "a@b.com",
        display_name: "Alice",
        password: "securepass123",
      });
      expect(result.email).toBe("a@b.com");
      expect(result.role).toBe("viewer");
      // Verify password_hash was passed (4th param of insert)
      const insertArgs = mockDb.query.mock.calls[1][1];
      expect(insertArgs[2]).toContain(":"); // salt:hash format
    });

    it("throws ConflictException for duplicate email", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1" }] });
      await expect(
        service.register({ email: "a@b.com", display_name: "Alice", password: "securepass123" }),
      ).rejects.toThrow(ConflictException);
    });

    it("throws BadRequestException for short password", async () => {
      await expect(
        service.register({ email: "a@b.com", display_name: "Alice", password: "short" }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -- Login --
  describe("login", () => {
    it("authenticates with correct password", async () => {
      // First register to get a valid hash
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // register email check
        .mockResolvedValueOnce({
          rows: [{ id: "u-1", email: "a@b.com", display_name: "Alice", role: "viewer" }],
        }); // register insert
      await service.register({ email: "a@b.com", display_name: "Alice", password: "securepass123" });
      const storedHash = mockDb.query.mock.calls[1][1][2];

      // Now login
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: "u-1", email: "a@b.com", display_name: "Alice", role: "viewer", is_active: true, password_hash: storedHash }],
        }) // select user
        .mockResolvedValueOnce({ rows: [] }); // update last_login_at
      const result = await service.login({ email: "a@b.com", password: "securepass123" });
      expect(result.email).toBe("a@b.com");
    });

    it("rejects wrong password", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: "u-1", email: "a@b.com", display_name: "Alice", role: "viewer" }],
        });
      await service.register({ email: "a@b.com", display_name: "Alice", password: "securepass123" });
      const storedHash = mockDb.query.mock.calls[1][1][2];

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "u-1", email: "a@b.com", display_name: "Alice", role: "viewer", is_active: true, password_hash: storedHash }],
      });
      await expect(
        service.login({ email: "a@b.com", password: "wrongpassword" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("rejects non-existent user", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.login({ email: "nobody@b.com", password: "anything" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("rejects deactivated user", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: "u-1", email: "a@b.com", display_name: "Alice", role: "viewer" }],
        });
      await service.register({ email: "a@b.com", display_name: "Alice", password: "securepass123" });
      const storedHash = mockDb.query.mock.calls[1][1][2];

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "u-1", email: "a@b.com", display_name: "Alice", role: "viewer", is_active: false, password_hash: storedHash }],
      });
      await expect(
        service.login({ email: "a@b.com", password: "securepass123" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // -- Forgot Password --
  describe("forgotPassword", () => {
    it("returns success even for non-existent email", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.forgotPassword({ email: "nobody@b.com" });
      expect(result.message).toContain("reset link");
    });

    it("generates reset token for existing user", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: "u-1", email: "a@b.com" }] })
        .mockResolvedValueOnce({ rows: [] }); // update
      const result = await service.forgotPassword({ email: "a@b.com" });
      expect(result.reset_token).toBeDefined();
      expect(result.reset_token!.length).toBe(64); // 32 bytes hex
    });
  });

  // -- Reset Password --
  describe("resetPassword", () => {
    it("resets password with valid token", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: "u-1", reset_token_expires: new Date(Date.now() + 3600000) }] })
        .mockResolvedValueOnce({ rows: [] }); // update
      const result = await service.resetPassword({ token: "validtoken", password: "newpassword123" });
      expect(result.message).toContain("successfully");
    });

    it("rejects invalid token", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.resetPassword({ token: "badtoken", password: "newpassword123" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects short password", async () => {
      await expect(
        service.resetPassword({ token: "anytoken", password: "short" }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -- Change Password --
  describe("changePassword", () => {
    it("changes password for valid user", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: "u-1", email: "a@b.com", display_name: "Alice", role: "viewer" }],
        });
      await service.register({ email: "a@b.com", display_name: "Alice", password: "oldpassword1" });
      const storedHash = mockDb.query.mock.calls[1][1][2];

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: "u-1", password_hash: storedHash }] })
        .mockResolvedValueOnce({ rows: [] }); // update
      const result = await service.changePassword({
        user_id: "u-1",
        current_password: "oldpassword1",
        new_password: "newpassword1",
      });
      expect(result.message).toContain("changed");
    });

    it("rejects wrong current password", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: "u-1", email: "a@b.com", display_name: "Alice", role: "viewer" }],
        });
      await service.register({ email: "a@b.com", display_name: "Alice", password: "oldpassword1" });
      const storedHash = mockDb.query.mock.calls[1][1][2];

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1", password_hash: storedHash }] });
      await expect(
        service.changePassword({ user_id: "u-1", current_password: "wrong", new_password: "newpassword1" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("rejects non-existent user", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.changePassword({ user_id: "u-missing", current_password: "x", new_password: "newpassword1" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -- Seed password compatibility (Regression) --
  describe("seed password compatibility", () => {
    it("login accepts passwords hashed with same scrypt algorithm as seed.mjs", async () => {
      // The seed script uses: scryptSync(password, salt, 64) with randomBytes(32) salt
      const { randomBytes, scryptSync } = require("crypto");
      const salt = randomBytes(32).toString("hex");
      const hash = scryptSync("admin123!", salt, 64).toString("hex");
      const seedHash = `${salt}:${hash}`;

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: "u-seed", email: "admin@perftest.io", display_name: "Admin User", role: "admin", is_active: true, password_hash: seedHash }],
        })
        .mockResolvedValueOnce({ rows: [] }); // update last_login_at
      const result = await service.login({ email: "admin@perftest.io", password: "admin123!" });
      expect(result.email).toBe("admin@perftest.io");
      expect(result.role).toBe("admin");
    });

    it("login rejects wrong password against seed hash", async () => {
      const { randomBytes, scryptSync } = require("crypto");
      const salt = randomBytes(32).toString("hex");
      const hash = scryptSync("admin123!", salt, 64).toString("hex");
      const seedHash = `${salt}:${hash}`;

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "u-seed", email: "admin@perftest.io", display_name: "Admin User", role: "admin", is_active: true, password_hash: seedHash }],
      });
      await expect(
        service.login({ email: "admin@perftest.io", password: "wrongpassword" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // -- Expired reset token (Regression) --
  // The expiry check is in the SQL: WHERE reset_token_expires > now()
  // An expired token returns empty rows, which the service treats as invalid.
  describe("resetPassword — expired token", () => {
    it("rejects expired reset token (DB returns no rows)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.resetPassword({ token: "expiredtoken", password: "newpassword123" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("accepts valid non-expired token (DB returns matching row)", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: "u-1", reset_token_expires: new Date(Date.now() + 3600000) }],
        })
        .mockResolvedValueOnce({ rows: [] }); // update password
      const result = await service.resetPassword({ token: "validtoken", password: "newpassword123" });
      expect(result.message).toContain("successfully");
    });
  });

  // -- Register + Login round-trip (Regression) --
  describe("register + login round-trip", () => {
    it("can login immediately after register with the same password", async () => {
      // Register
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: "u-new", email: "new@test.io", display_name: "New User", role: "viewer" }],
        });
      await service.register({ email: "new@test.io", display_name: "New User", password: "newuser123!" });
      const storedHash = mockDb.query.mock.calls[1][1][2];

      // Login with same password
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: "u-new", email: "new@test.io", display_name: "New User", role: "viewer", is_active: true, password_hash: storedHash }],
        })
        .mockResolvedValueOnce({ rows: [] });
      const loginResult = await service.login({ email: "new@test.io", password: "newuser123!" });
      expect(loginResult.id).toBe("u-new");
    });
  });
});
