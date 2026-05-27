import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface EnvironmentRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  created_at: Date;
}

const DEFAULT_ENVIRONMENTS = [
  { name: "Staging", slug: "staging", description: "Pre-production testing environment" },
  { name: "Production", slug: "production", description: "Live production environment" },
  { name: "Development", slug: "development", description: "Local development environment" },
  { name: "QA", slug: "qa", description: "Quality assurance testing" },
  { name: "UAT", slug: "uat", description: "User acceptance testing" },
  { name: "Performance", slug: "performance", description: "Dedicated performance testing" },
];

@Injectable()
export class EnvironmentsService {
  private environments: { id: string; name: string; slug: string; description: string; created_at: Date }[] = [];

  constructor(private readonly db: DatabaseService) {
    this.initDefaults();
  }

  private initDefaults() {
    this.environments = DEFAULT_ENVIRONMENTS.map((env, i) => ({
      id: `env-${i + 1}`,
      ...env,
      created_at: new Date(),
    }));
  }

  async findAll(): Promise<typeof this.environments> {
    return this.environments;
  }

  async create(data: { name: string; slug: string; description?: string }): Promise<typeof this.environments[0]> {
    const env = {
      id: `env-${Date.now()}`,
      name: data.name,
      slug: data.slug.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
      description: data.description ?? "",
      created_at: new Date(),
    };
    this.environments.push(env);
    return env;
  }

  async delete(id: string): Promise<void> {
    const idx = this.environments.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`Environment ${id} not found`);
    this.environments.splice(idx, 1);
  }
}
