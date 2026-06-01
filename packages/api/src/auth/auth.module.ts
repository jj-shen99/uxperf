import { Module, Global } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtService } from "./jwt.service";
import { AuthGuard } from "./auth.guard";
import { CryptoService } from "./crypto.service";

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, JwtService, AuthGuard, CryptoService],
  exports: [AuthService, JwtService, AuthGuard, CryptoService],
})
export class AuthModule {}
