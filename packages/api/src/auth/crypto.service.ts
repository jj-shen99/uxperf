import { Injectable, Logger } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT = "perf-framework-token-encryption";

/**
 * Symmetric encryption for secrets stored at rest (e.g., GitHub tokens).
 * Key derived from TOKEN_ENCRYPTION_KEY env var via scrypt.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    const envKey = process.env.TOKEN_ENCRYPTION_KEY || "CHANGE_ME_default_dev_key_32chars!!";
    if (!process.env.TOKEN_ENCRYPTION_KEY) {
      new Logger("CryptoService").warn(
        "TOKEN_ENCRYPTION_KEY not set — using insecure default. Set TOKEN_ENCRYPTION_KEY in production.",
      );
    }
    this.key = scryptSync(envKey, SALT, 32);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Format: iv:tag:ciphertext (all hex)
    return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted format");
    }
    const [ivHex, tagHex, encHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const encrypted = Buffer.from(encHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }

  /** Check if a string looks like an encrypted token (vs plaintext) */
  isEncrypted(value: string): boolean {
    return /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/.test(value);
  }
}
