/// <reference types="multer" />
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Owner } from "@ssurak/db";
import {
  menuDraftListResponseSchema,
  menuDraftResponseSchema,
  storeIdAndDraftIdParamsSchema,
  storeIdParamsSchema,
  updateMenuDraftPayloadSchema,
} from "@ssurak/schema";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { Client } from "src/decorators/client.decorator";
import {
  DocsMenuDraftCreate,
  DocsMenuDraftGetList,
  DocsMenuDraftGetUnique,
  DocsMenuDraftUpdate,
} from "src/docs/menuDraft.docs";
import { UpdateMenuDraftPayloadDto } from "src/dto/request/menuDraft.dto";
import {
  MenuDraftListResponseDto,
  MenuDraftResponseDto,
} from "src/dto/response/menuDraft.dto";
import { ImageUpload } from "src/storage/image-upload.decorator";
import {
  MAX_OCR_FILE_COUNT,
  MAX_OCR_FILE_SIZE_MB,
} from "src/storage/storage.constants";
import { StoreAccessGuard } from "src/utils/guards/store-access.guard";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import { MenuDraftService } from "./menu-draft.service";

@ApiTags("Menu")
@ApiBearerAuth()
@Controller(":storeId/menus/drafts")
@UseGuards(JwtAuthGuard, StoreAccessGuard)
export class MenuDraftController {
  constructor(private readonly menuDraftService: MenuDraftService) {}

  @Post()
  @UseGuards(ZodValidation({ params: storeIdParamsSchema }))
  @ImageUpload({
    maxFileSizeMb: MAX_OCR_FILE_SIZE_MB,
    maxCount: MAX_OCR_FILE_COUNT,
  })
  @DocsMenuDraftCreate()
  async create(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined
  ): Promise<MenuDraftResponseDto> {
    if (!files || files.length === 0) {
      throw new BadRequestException("메뉴판 사진을 한 장 이상 올려주세요.");
    }

    const draft = await this.menuDraftService.createDraft(
      client,
      storeId,
      files.map((file) => ({
        buffer: file.buffer,
        fileName: file.originalname,
        byteSize: file.size,
      }))
    );

    return menuDraftResponseSchema.parse(draft);
  }

  @Get()
  @UseGuards(ZodValidation({ params: storeIdParamsSchema }))
  @DocsMenuDraftGetList()
  async list(
    @Client() client: Owner,
    @Param("storeId") storeId: string
  ): Promise<MenuDraftListResponseDto> {
    const drafts = await this.menuDraftService.listDrafts(client, storeId);

    return menuDraftListResponseSchema.parse(drafts);
  }

  @Get(":draftId")
  @UseGuards(ZodValidation({ params: storeIdAndDraftIdParamsSchema }))
  @DocsMenuDraftGetUnique()
  async unique(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("draftId") draftId: string
  ): Promise<MenuDraftResponseDto> {
    const draft = await this.menuDraftService.getDraft(
      client,
      storeId,
      draftId
    );

    return menuDraftResponseSchema.parse(draft);
  }

  @Patch(":draftId")
  @UseGuards(
    ZodValidation({
      params: storeIdAndDraftIdParamsSchema,
      body: updateMenuDraftPayloadSchema,
    })
  )
  @DocsMenuDraftUpdate()
  async updateItems(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("draftId") draftId: string,
    @Body() updateMenuDraftPayload: UpdateMenuDraftPayloadDto
  ): Promise<MenuDraftResponseDto> {
    const updated = await this.menuDraftService.updateDraftItems(
      client,
      storeId,
      draftId,
      updateMenuDraftPayload
    );

    return menuDraftResponseSchema.parse(updated);
  }
}
