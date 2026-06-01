import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, QueryResult, QueryResultRow } from "pg";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString && process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_URL environment variable is required in production");
    }
    this.pool = new Pool({
      connectionString: connectionString || "postgresql://perf:perf@localhost:5432/perf_framework",
      max: 20,
    });
  }

  async query<T extends QueryResultRow = any>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
