import { Controller, Post, Body } from "@nestjs/common";
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

@Throttle({ default: { ttl: 60000, limit: 5 } })
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwt: JwtService,
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
}
