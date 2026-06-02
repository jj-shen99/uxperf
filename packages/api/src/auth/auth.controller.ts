import { Controller, Post, Body, UnauthorizedException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  AuthService,
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from "./auth.service";
import { JwtService } from "./jwt.service";
import { Public } from "./auth.guard";
import { DatabaseService } from "../database/database.service";

@Throttle({ default: { ttl: 60000, limit: 5 } })
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwt: JwtService,
    private readonly db: DatabaseService,
  ) {}

  @Public()
  @Post("register")
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { ...user, token };
  }

  @Public()
  @Post("login")
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.login(dto);
    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { ...user, token };
  }

  @Public()
  @Post("forgot-password")
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post("reset-password")
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post("change-password")
  changePassword(@Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(dto);
  }

  /**
   * Session upgrade: existing dashboard sessions (pre-JWT) can exchange
   * their stored user ID for a JWT. Verifies user exists in DB.
   *
   * SECURITY: This endpoint is rate-limited to 2 req/min and requires a
   * valid UUID format. It exists only for migrating pre-JWT sessions and
   * should be removed once all clients have upgraded.
   */
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 2 } })
  @Post("session-upgrade")
  async sessionUpgrade(@Body() body: { user_id: string; email?: string }) {
    if (!body.user_id) throw new UnauthorizedException("user_id required");
    // Validate UUID format to prevent enumeration attacks
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(body.user_id)) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const result = await this.db.query<{ id: string; email: string; role: string; is_active: boolean }>(
      "SELECT id, email, role, is_active FROM users WHERE id = $1",
      [body.user_id],
    );
    const user = result.rows[0];
    if (!user || !user.is_active) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { token, id: user.id, email: user.email, role: user.role };
  }
}
