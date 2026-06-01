import { NestFactory } from "@nestjs/core";
import { json } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:4200";
  app.enableCors({
    origin: corsOrigin === "*"
      ? true
      : corsOrigin.includes(",")
        ? corsOrigin.split(",").map((o) => o.trim())
        : corsOrigin,
    credentials: true,
  });
  app.use(json({ limit: "50mb" }));
  app.setGlobalPrefix("api/v1");

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`API server running on http://localhost:${port}`);
}
bootstrap();
