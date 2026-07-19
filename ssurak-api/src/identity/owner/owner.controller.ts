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
import { OwnerService } from "./owner.service";
import {
  DocsOwnerCreate,
  DocsOwnerDelete,
  DocsOwnerGetList,
  DocsOwnerGetUnique,
  DocsOwnerUpdate,
} from "src/docs/owner.docs";
import {
  createOwnerPayloadSchema,
  ownerIdParamsSchema,
  updateOwnerPayloadSchema,
} from "@ssurak/schema";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import type { Owner } from "@ssurak/db";
import { PublicOwnerDto } from "src/dto/response/owner.dto";
import { Client } from "src/decorators/client.decorator";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import {
  CreateOwnerPayloadDto,
  UpdateOwnerPayloadDto,
} from "src/dto/request/owner.dto";
import { OwnerAccessGuard } from "src/utils/guards/owner-access.guard";

@ApiTags("Owner")
@ApiBearerAuth()
@Controller("owners")
@UseGuards(JwtAuthGuard)
export class OwnerController {
  constructor(private readonly ownerService: OwnerService) {}

  @Post()
  @UseGuards(ZodValidation({ body: createOwnerPayloadSchema }))
  @DocsOwnerCreate()
  async create(
    @Body() createOwnerPayload: CreateOwnerPayloadDto
  ): Promise<PublicOwnerDto> {
    return PublicOwnerDto.schema.parse(
      await this.ownerService.createOwner(createOwnerPayload)
    );
  }

  @Get()
  @DocsOwnerGetList()
  async list(@Client() owner: Owner): Promise<PublicOwnerDto[]> {
    const owners = await this.ownerService.getOwnerList(owner.id);
    return PublicOwnerDto.schema.array().parse(owners);
  }

  @Get(":ownerId")
  @UseGuards(OwnerAccessGuard, ZodValidation({ params: ownerIdParamsSchema }))
  @DocsOwnerGetUnique()
  async unique(@Param("ownerId") ownerId: string): Promise<PublicOwnerDto> {
    return PublicOwnerDto.schema.parse(
      await this.ownerService.getOwnerUniqueById(ownerId)
    );
  }

  @Patch(":ownerId")
  @UseGuards(
    OwnerAccessGuard,
    ZodValidation({
      params: ownerIdParamsSchema,
      body: updateOwnerPayloadSchema,
    })
  )
  @DocsOwnerUpdate()
  async partialUpdate(
    @Param("ownerId") ownerId: string,
    @Body() updateOwnerPayloadDto: UpdateOwnerPayloadDto
  ): Promise<PublicOwnerDto> {
    return PublicOwnerDto.schema.parse(
      await this.ownerService.partialUpdateOwner(ownerId, updateOwnerPayloadDto)
    );
  }

  @Delete(":ownerId")
  @HttpCode(204)
  @UseGuards(OwnerAccessGuard, ZodValidation({ params: ownerIdParamsSchema }))
  @DocsOwnerDelete()
  async delete(@Param("ownerId") ownerId: string): Promise<void> {
    await this.ownerService.deleteOwner(ownerId);
  }
}
