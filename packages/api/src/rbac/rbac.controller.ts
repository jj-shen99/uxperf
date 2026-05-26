import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from "@nestjs/common";
import { RbacService, CreateUserDto, UpdateUserDto, AddMemberDto } from "./rbac.service";

@Controller("rbac")
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  // -- Users --

  @Get("users")
  listUsers() {
    return this.rbacService.findAllUsers();
  }

  @Get("users/:id")
  getUser(@Param("id") id: string) {
    return this.rbacService.findUserById(id);
  }

  @Post("users")
  createUser(@Body() dto: CreateUserDto) {
    return this.rbacService.createUser(dto);
  }

  @Patch("users/:id")
  updateUser(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.rbacService.updateUser(id, dto);
  }

  @Delete("users/:id")
  deleteUser(@Param("id") id: string) {
    return this.rbacService.deleteUser(id);
  }

  // -- Project Members --

  @Get("projects/:projectId/members")
  getProjectMembers(@Param("projectId") projectId: string) {
    return this.rbacService.getProjectMembers(projectId);
  }

  @Post("projects/:projectId/members")
  addProjectMember(
    @Param("projectId") projectId: string,
    @Body() dto: { user_id: string; role?: "owner" | "editor" | "viewer" },
  ) {
    return this.rbacService.addProjectMember({
      project_id: projectId,
      user_id: dto.user_id,
      role: dto.role,
    });
  }

  @Delete("projects/:projectId/members/:userId")
  removeProjectMember(
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
  ) {
    return this.rbacService.removeProjectMember(projectId, userId);
  }
}
