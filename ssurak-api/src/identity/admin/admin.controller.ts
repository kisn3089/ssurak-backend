import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AdminService } from "./admin.service";
import {
  DocsAdminCreate,
  DocsAdminDelete,
  DocsAdminGetList,
  DocsAdminGetUnique,
  DocsAdminUpdate,
} from "src/docs/admin.docs";
import { PublicAdminDto } from "src/dto/response/admin.dto";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { Client } from "src/decorators/client.decorator";
import type { Admin } from "@ssurak/db";
import {
  CreateAdminPayloadDto,
  UpdateAdminPayloadDto,
} from "src/dto/request/admin.dto";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import {
  adminIdParamsSchema,
  createAdminPayloadSchema,
  updateAdminPayloadSchema,
} from "@ssurak/schema";
import { AdminAccessGuard } from "src/utils/guards/admin-access.guard";

@ApiTags("Admin")
@ApiBearerAuth()
@Controller("admins")
@UseGuards(JwtAuthGuard, AdminAccessGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post()
  @UseGuards(ZodValidation({ body: createAdminPayloadSchema }))
  @DocsAdminCreate()
  async create(
    @Body() createAdminPayload: CreateAdminPayloadDto
  ): Promise<PublicAdminDto> {
    const createdAdmin =
      await this.adminService.createAdmin(createAdminPayload);
    return PublicAdminDto.schema.parse(createdAdmin);
  }

  @Get()
  @DocsAdminGetList()
  async getList(@Client() admin: Admin): Promise<PublicAdminDto[]> {
    const admins = await this.adminService.getAdminList(admin.id);
    return PublicAdminDto.schema.array().parse(admins);
  }

  @Get(":adminId")
  @UseGuards(ZodValidation({ params: adminIdParamsSchema }))
  @DocsAdminGetUnique()
  async getUnique(@Param("adminId") adminId: string): Promise<PublicAdminDto> {
    return PublicAdminDto.schema.parse(
      await this.adminService.getAdminUniqueById(adminId)
    );
  }

  @Patch(":adminId")
  @UseGuards(
    ZodValidation({
      params: adminIdParamsSchema,
      body: updateAdminPayloadSchema,
    })
  )
  @DocsAdminUpdate()
  async partialUpdate(
    @Param("adminId") adminId: string,
    @Body() updateAdminPayload: UpdateAdminPayloadDto
  ): Promise<PublicAdminDto> {
    const updatedAdmin = await this.adminService.partialUpdateAdmin(
      adminId,
      updateAdminPayload
    );
    return PublicAdminDto.schema.parse(updatedAdmin);
  }

  @Delete(":adminId")
  @UseGuards(ZodValidation({ params: adminIdParamsSchema }))
  @HttpCode(204)
  @DocsAdminDelete()
  async delete(@Param("adminId") adminId: string) {
    await this.adminService.deleteAdmin(adminId);
  }
}
