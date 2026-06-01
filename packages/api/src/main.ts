import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { json } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers
  app.use(helmet());

  // CORS
  const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:4200";
  app.enableCors({
    origin: corsOrigin === "*"
      ? true
      : corsOrigin.includes(",")
        ? corsOrigin.split(",").map((o) => o.trim())
        : corsOrigin,
    credentials: true,
  });

  // Body size limit — 10MB (worker uploads Lighthouse reports which can be 2–5MB)
  app.use(json({ limit: "10mb" }));

  // Global validation pipe (class-validator)
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  app.setGlobalPrefix("api/v1");

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`API server running on http://localhost:${port}`);
}
bootstrap();
