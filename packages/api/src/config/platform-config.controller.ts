import { Controller, Get, Put, Delete, Param, Body, Query } from "@nestjs/common";
import { PlatformConfigService } from "./platform-config.service";

@Controller("config")
export class PlatformConfigController {
  constructor(private readonly configService: PlatformConfigService) {}

  @Get()
  getAll(@Query("prefix") prefix?: string) {
    return this.configService.getAll(prefix);
  }

  @Get(":key")
  async get(@Param("key") key: string) {
    const value = await this.configService.get(key);
    return { key, value };
  }

  @Put(":key")
  async set(@Param("key") key: string, @Body() body: { value: string }) {
    await this.configService.set(key, body.value);
    return { key, value: body.value };
  }

  @Delete(":key")
  async remove(@Param("key") key: string) {
    await this.configService.delete(key);
    return { key, deleted: true };
  }
}
