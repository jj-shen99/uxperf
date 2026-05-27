import { Test } from "@nestjs/testing";
import { ScriptsController } from "./scripts.controller";
import { ScriptsService } from "./scripts.service";
import { ScriptVersionsService } from "./script-versions.service";
import { RbacService } from "../rbac/rbac.service";

describe("ScriptsController", () => {
  let controller: ScriptsController;
  const mockScripts = {
    findAll: jest.fn().mockResolvedValue([{ id: "sc-1", name: "Homepage" }]),
    findById: jest.fn().mockResolvedValue({ id: "sc-1", name: "Homepage" }),
    create: jest.fn().mockResolvedValue({ id: "sc-1" }),
    update: jest.fn().mockResolvedValue({ id: "sc-1", name: "Updated" }),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const mockVersions = {
    listVersions: jest.fn().mockResolvedValue([{ version: 1 }]),
    getVersion: jest.fn().mockResolvedValue({ version: 1 }),
    createVersion: jest.fn().mockResolvedValue({ version: 2 }),
  };
  const mockRbac = {
    findUserById: jest.fn().mockResolvedValue({ id: "u-1", role: "viewer" }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ScriptsController],
      providers: [
        { provide: ScriptsService, useValue: mockScripts },
        { provide: ScriptVersionsService, useValue: mockVersions },
        { provide: RbacService, useValue: mockRbac },
      ],
    }).compile();
    controller = module.get(ScriptsController);
  });

  it("lists scripts", async () => {
    const result = await controller.findAll("p-1");
    expect(result).toHaveLength(1);
    // userId is undefined, so isAdmin stays false (no RBAC lookup needed)
    expect(mockScripts.findAll).toHaveBeenCalledWith("p-1", undefined, false);
  });

  it("gets script by id", async () => {
    const result = await controller.findOne("sc-1");
    expect(result.id).toBe("sc-1");
  });

  it("creates script", async () => {
    const dto = { project_id: "p-1", name: "Homepage", canonical_json: {} } as any;
    await controller.create(dto);
    expect(mockScripts.create).toHaveBeenCalledWith(dto);
  });

  it("updates script", async () => {
    await controller.update("sc-1", { name: "Updated" } as any);
    expect(mockScripts.update).toHaveBeenCalledWith("sc-1", { name: "Updated" });
  });

  it("deletes script", async () => {
    await controller.remove("sc-1");
    expect(mockScripts.delete).toHaveBeenCalledWith("sc-1");
  });

  it("lists versions", async () => {
    const result = await controller.listVersions("sc-1");
    expect(result).toHaveLength(1);
    expect(mockVersions.listVersions).toHaveBeenCalledWith("sc-1");
  });

  it("gets version", async () => {
    await controller.getVersion("sc-1", "1");
    expect(mockVersions.getVersion).toHaveBeenCalledWith("sc-1", 1);
  });

  it("creates version", async () => {
    await controller.createVersion("sc-1", { content_json: {} } as any);
    expect(mockVersions.createVersion).toHaveBeenCalledWith({ content_json: {}, script_id: "sc-1" });
  });
});
