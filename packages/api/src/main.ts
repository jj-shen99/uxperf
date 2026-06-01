import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { json } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { fork, ChildProcess } from "child_process";
import { resolve } from "path";

let workerProcess: ChildProcess | null = null;

function startWorker() {
  if (process.env.DISABLE_WORKER === "true") {
    console.log("[api] Worker auto-start disabled (DISABLE_WORKER=true)");
    return;
  }

  const workerScript = resolve(__dirname, "../../worker/src/poll-loop.ts");
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    API_URL: `http://localhost:${process.env.PORT || 4000}/api/v1`,
  };

  // Pass K6_BROWSER_ENABLED from env if set
  if (process.env.K6_BROWSER_ENABLED) {
    env.K6_BROWSER_ENABLED = process.env.K6_BROWSER_ENABLED;
  }

  try {
    workerProcess = fork(workerScript, [], {
      execArgv: ["--import", "tsx"],
      env,
      stdio: ["pipe", "inherit", "inherit", "ipc"],
    });

    workerProcess.on("exit", (code) => {
      console.log(`[api] Worker process exited with code ${code}`);
      workerProcess = null;
      // Auto-restart after 5s unless it was intentionally killed
      if (code !== 0 && code !== null) {
        console.log("[api] Restarting worker in 5s...");
        setTimeout(startWorker, 5000);
      }
    });

    workerProcess.on("error", (err) => {
      console.error(`[api] Worker process error: ${err.message}`);
    });

    console.log(`[api] Worker poll-loop started (PID: ${workerProcess.pid})`);
  } catch (err) {
    console.error(`[api] Failed to start worker: ${err}`);
  }
}

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

  // Auto-start worker poll-loop
  startWorker();

  // Graceful shutdown: kill worker when API shuts down
  const shutdown = () => {
    if (workerProcess) {
      console.log("[api] Stopping worker...");
      workerProcess.kill("SIGTERM");
    }
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
bootstrap();
