import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { DatabaseModule } from "./database/database.module";
import { ProjectsModule } from "./projects/projects.module";
import { RunsModule } from "./runs/runs.module";
import { ScriptsModule } from "./scripts/scripts.module";
import { GatesModule } from "./gates/gates.module";
import { SchedulesModule } from "./schedules/schedules.module";
import { ArtifactsModule } from "./artifacts/artifacts.module";
import { BaselinesModule } from "./baselines/baselines.module";
import { TrendsModule } from "./trends/trends.module";
import { GitHubCheckModule } from "./github/github-check.module";
import { RbacModule } from "./rbac/rbac.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PerRequestModule } from "./per-request/per-request.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { ReportsModule } from "./reports/reports.module";
import { AuthoringModule } from "./authoring/authoring.module";
import { LoadModule } from "./load/load.module";
import { IntelligenceModule } from "./intelligence/intelligence.module";
import { AuthModule } from "./auth/auth.module";
import { EnvironmentsModule } from "./environments/environments.module";
import { BudgetsModule } from "./budgets/budgets.module";
import { ConfigModule } from "./config/config.module";
import { HealthController } from "./health.controller";
import { AuthGuard } from "./auth/auth.guard";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    DatabaseModule,
    ArtifactsModule,
    ProjectsModule,
    ScriptsModule,
    RunsModule,
    GatesModule,
    SchedulesModule,
    BaselinesModule,
    TrendsModule,
    GitHubCheckModule,
    RbacModule,
    NotificationsModule,
    PerRequestModule,
    AnalyticsModule,
    ReportsModule,
    AuthoringModule,
    LoadModule,
    IntelligenceModule,
    AuthModule,
    EnvironmentsModule,
    BudgetsModule,
    ConfigModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
