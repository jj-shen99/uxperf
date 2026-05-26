import { Injectable, NotFoundException, ForbiddenException, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export type GlobalRole = "admin" | "editor" | "viewer";
export type ProjectRole = "owner" | "editor" | "viewer";

export interface CreateUserDto {
  email: string;
  display_name: string;
  role?: GlobalRole;
}

export interface UpdateUserDto {
  display_name?: string;
  role?: GlobalRole;
  is_active?: boolean;
}

export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: GlobalRole;
  api_key_hash: string | null;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectMemberRow {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  created_at: Date;
}

export interface AddMemberDto {
  project_id: string;
  user_id: string;
  role?: ProjectRole;
}

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  constructor(private readonly db: DatabaseService) {}

  // -- Users CRUD --

  async findAllUsers(): Promise<UserRow[]> {
    const result = await this.db.query<UserRow>(
      "SELECT id, email, display_name, role, is_active, last_login_at, created_at, updated_at FROM users ORDER BY created_at DESC",
    );
    return result.rows;
  }

  async findUserById(id: string): Promise<UserRow> {
    const result = await this.db.query<UserRow>(
      "SELECT id, email, display_name, role, is_active, last_login_at, created_at, updated_at FROM users WHERE id = $1",
      [id],
    );
    if (result.rows.length === 0) throw new NotFoundException(`User ${id} not found`);
    return result.rows[0];
  }

  async findUserByEmail(email: string): Promise<UserRow | null> {
    const result = await this.db.query<UserRow>(
      "SELECT id, email, display_name, role, is_active, last_login_at, created_at, updated_at FROM users WHERE email = $1",
      [email],
    );
    return result.rows[0] ?? null;
  }

  async createUser(dto: CreateUserDto): Promise<UserRow> {
    const result = await this.db.query<UserRow>(
      `INSERT INTO users (email, display_name, role)
       VALUES ($1, $2, $3) RETURNING id, email, display_name, role, is_active, last_login_at, created_at, updated_at`,
      [dto.email, dto.display_name, dto.role ?? "viewer"],
    );
    return result.rows[0];
  }

  async updateUser(id: string, dto: UpdateUserDto): Promise<UserRow> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.display_name !== undefined) { sets.push(`display_name = $${idx++}`); values.push(dto.display_name); }
    if (dto.role !== undefined) { sets.push(`role = $${idx++}`); values.push(dto.role); }
    if (dto.is_active !== undefined) { sets.push(`is_active = $${idx++}`); values.push(dto.is_active); }

    if (sets.length === 0) return this.findUserById(id);

    values.push(id);
    const result = await this.db.query<UserRow>(
      `UPDATE users SET ${sets.join(", ")} WHERE id = $${idx}
       RETURNING id, email, display_name, role, is_active, last_login_at, created_at, updated_at`,
      values,
    );
    if (result.rows.length === 0) throw new NotFoundException(`User ${id} not found`);
    return result.rows[0];
  }

  async deleteUser(id: string): Promise<void> {
    const result = await this.db.query("DELETE FROM users WHERE id = $1", [id]);
    if (result.rowCount === 0) throw new NotFoundException(`User ${id} not found`);
  }

  // -- Project Members --

  async getProjectMembers(projectId: string): Promise<(ProjectMemberRow & { email: string; display_name: string })[]> {
    const result = await this.db.query(
      `SELECT pm.*, u.email, u.display_name
       FROM project_members pm JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = $1 ORDER BY pm.created_at`,
      [projectId],
    );
    return result.rows;
  }

  async addProjectMember(dto: AddMemberDto): Promise<ProjectMemberRow> {
    const result = await this.db.query<ProjectMemberRow>(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING *`,
      [dto.project_id, dto.user_id, dto.role ?? "viewer"],
    );
    return result.rows[0];
  }

  async removeProjectMember(projectId: string, userId: string): Promise<void> {
    await this.db.query(
      "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, userId],
    );
  }

  // -- Authorization checks --

  async checkProjectAccess(
    userId: string,
    projectId: string,
    requiredRole: ProjectRole,
  ): Promise<void> {
    const user = await this.findUserById(userId);

    // Admins have full access
    if (user.role === "admin") return;

    const roleHierarchy: Record<ProjectRole, number> = { owner: 3, editor: 2, viewer: 1 };

    const result = await this.db.query<ProjectMemberRow>(
      "SELECT * FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, userId],
    );

    if (result.rows.length === 0) {
      throw new ForbiddenException("Not a member of this project");
    }

    const memberRole = result.rows[0].role;
    if (roleHierarchy[memberRole] < roleHierarchy[requiredRole]) {
      throw new ForbiddenException(
        `Requires ${requiredRole} role, but you have ${memberRole}`,
      );
    }
  }
}
