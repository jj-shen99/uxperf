import { Injectable, Logger } from "@nestjs/common";
import { createHmac, randomBytes } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_IN_PRODUCTION_" + randomBytes(16).toString("hex");
if (!process.env.JWT_SECRET) {
  const logger = new Logger("JwtService");
  logger.warn("JWT_SECRET not set — using an auto-generated fallback. Tokens will not survive restarts. Set JWT_SECRET in production.");
}
const JWT_EXPIRES_SECONDS = parseInt(process.env.JWT_EXPIRES_SECONDS || "86400", 10); // 24h

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

function base64url(data: string): string {
  return Buffer.from(data).toString("base64url");
}

@Injectable()
export class JwtService {
  sign(payload: JwtPayload): string {
    const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const now = Math.floor(Date.now() / 1000);
    const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + JWT_EXPIRES_SECONDS }));
    const signature = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    return `${header}.${body}.${signature}`;
  }

  verify(token: string): JwtPayload | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const [header, body, signature] = parts;
      const expected = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
      if (signature !== expected) return null;
      const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as JwtPayload;
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
      return payload;
    } catch {
      return null;
    }
  }
}
