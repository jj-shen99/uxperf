import { Module } from "@nestjs/common";
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
import { HealthController } from "./health.controller";

@Module({
  imports: [
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
