import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export interface RegisterDto {
  email: string;
  display_name: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  token: string;
  password: string;
}

export interface ChangePasswordDto {
  user_id: string;
  current_password: string;
  new_password: string;
}

export interface AuthUserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  password_hash: string | null;
  last_login_at: Date | null;
}

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_EXPIRY_HOURS = 24;
const MIN_PASSWORD_LENGTH = 8;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Hash a password using scrypt with a random salt */
  private hashPassword(password: string): string {
    const salt = randomBytes(SALT_LENGTH).toString("hex");
    const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
    return `${salt}:${hash}`;
  }

  /** Verify a password against a stored hash */
  private verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(":");
    const hashBuffer = Buffer.from(hash, "hex");
    const derivedKey = scryptSync(password, salt, KEY_LENGTH);
    return timingSafeEqual(hashBuffer, derivedKey);
  }

  private validatePassword(password: string): void {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
  }

  /** Register a new user */
  async register(dto: RegisterDto): Promise<{ id: string; email: string; display_name: string; role: string }> {
    this.validatePassword(dto.password);

    // Check for existing user
    const existing = await this.db.query(
      "SELECT id FROM users WHERE email = $1",
      [dto.email.toLowerCase().trim()],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException("Email already registered");
    }

    const passwordHash = this.hashPassword(dto.password);
    const result = await this.db.query<AuthUserRow>(
      `INSERT INTO users (email, display_name, password_hash, role)
       VALUES ($1, $2, $3, 'viewer')
       RETURNING id, email, display_name, role`,
      [dto.email.toLowerCase().trim(), dto.display_name.trim(), passwordHash],
    );

    this.logger.log(`New user registered: ${dto.email}`);
    return result.rows[0];
  }

  /** Authenticate a user with email + password */
  async login(dto: LoginDto): Promise<{ id: string; email: string; display_name: string; role: string }> {
    const result = await this.db.query<AuthUserRow>(
      `SELECT id, email, display_name, role, is_active, password_hash
       FROM users WHERE email = $1`,
      [dto.email.toLowerCase().trim()],
    );

    const user = result.rows[0];
    if (!user || !user.password_hash) {
      throw new UnauthorizedException("Invalid email or password");
    }
    if (!user.is_active) {
      throw new UnauthorizedException("Invalid email or password");
    }
    if (!this.verifyPassword(dto.password, user.password_hash)) {
      throw new UnauthorizedException("Invalid email or password");
    }

    // Update last_login_at
    await this.db.query(
      "UPDATE users SET last_login_at = now() WHERE id = $1",
      [user.id],
    );

    this.logger.log(`User logged in: ${user.email}`);
    return { id: user.id, email: user.email, display_name: user.display_name, role: user.role };
  }

  /** Generate a password reset token and return it (in production, email it) */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string; reset_token?: string }> {
    const result = await this.db.query<AuthUserRow>(
      "SELECT id, email FROM users WHERE email = $1",
      [dto.email.toLowerCase().trim()],
    );

    // Always return success to avoid email enumeration
    if (result.rows.length === 0) {
      return { message: "If that email is registered, a reset link has been sent." };
    }

    const token = randomBytes(RESET_TOKEN_BYTES).toString("hex");
    const expires = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    await this.db.query(
      "UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3",
      [token, expires, result.rows[0].id],
    );

    this.logger.log(`Password reset token generated for: ${dto.email}`);

    // In production, the token should be sent via email, never in the HTTP response.
    const isProduction = process.env.NODE_ENV === "production";
    return {
      message: "If that email is registered, a reset link has been sent.",
      ...(isProduction ? {} : { reset_token: token }),
    };
  }

  /** Reset password using a valid token */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    this.validatePassword(dto.password);

    const result = await this.db.query<AuthUserRow & { reset_token_expires: Date }>(
      `SELECT id, reset_token_expires FROM users
       WHERE reset_token = $1 AND reset_token_expires > now()`,
      [dto.token],
    );

    if (result.rows.length === 0) {
      throw new BadRequestException("Invalid or expired reset token");
    }

    const passwordHash = this.hashPassword(dto.password);
    await this.db.query(
      `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2`,
      [passwordHash, result.rows[0].id],
    );

    this.logger.log(`Password reset completed for user ${result.rows[0].id}`);
    return { message: "Password has been reset successfully" };
  }

  /** Change password for an authenticated user */
  async changePassword(dto: ChangePasswordDto): Promise<{ message: string }> {
    this.validatePassword(dto.new_password);

    const result = await this.db.query<AuthUserRow>(
      "SELECT id, password_hash FROM users WHERE id = $1",
      [dto.user_id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException("User not found");
    }

    const user = result.rows[0];
    if (user.password_hash && !this.verifyPassword(dto.current_password, user.password_hash)) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    const passwordHash = this.hashPassword(dto.new_password);
    await this.db.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [passwordHash, dto.user_id],
    );

    return { message: "Password changed successfully" };
  }
}
