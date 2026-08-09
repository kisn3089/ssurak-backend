/// <reference types="multer" />
import {
  BadRequestException,
  Controller,
  Param,
  Post,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Owner } from "@ssurak/db";
import { menuDraftResponseSchema, storeIdParamsSchema } from "@ssurak/schema";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { Client } from "src/decorators/client.decorator";
import { DocsMenuDraft } from "src/docs/menuDraft.docs";
import { MenuDraftResponseDto } from "src/dto/response/menuDraft.dto";
import { MulterExceptionFilter } from "src/storage/filter/multer-exception.filter";
import { imageUploadOptions } from "src/storage/image-upload.options";
import {
  FILE_FIELD_NAME,
  MAX_OCR_FILE_COUNT,
  MAX_OCR_FILE_SIZE,
  MAX_OCR_FILE_SIZE_MB,
} from "src/storage/storage.constants";
import { StoreAccessGuard } from "src/utils/guards/store-access.guard";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import { MenuDraftService } from "./menu-draft.service";

/**
 * 메뉴판 사진 → 메뉴 초안.
 *
 * 업로드 엔드포인트(upload/v1)가 아니라 매장 스코프에 있는 이유는 저장이 목적이
 * 아니기 때문이다. 인식 결과를 기존 카테고리에 붙이려면 매장 컨텍스트가 필요하고,
 * 소유권 검증(StoreAccessGuard)도 여기서만 걸린다.
 */
@ApiTags("Menu")
@ApiBearerAuth()
@Controller(":storeId/menus")
@UseGuards(JwtAuthGuard, StoreAccessGuard)
@UseFilters(
  MulterExceptionFilter({
    maxFileSizeMb: MAX_OCR_FILE_SIZE_MB,
    maxCount: MAX_OCR_FILE_COUNT,
  })
)
export class MenuDraftController {
  constructor(private readonly menuDraftService: MenuDraftService) {}

  @Post("draft")
  @UseGuards(ZodValidation({ params: storeIdParamsSchema }))
  @UseInterceptors(
    FilesInterceptor(
      FILE_FIELD_NAME,
      MAX_OCR_FILE_COUNT,
      imageUploadOptions(MAX_OCR_FILE_SIZE)
    )
  )
  @DocsMenuDraft()
  async draft(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined
  ): Promise<MenuDraftResponseDto> {
    if (!files || files.length === 0) {
      throw new BadRequestException("메뉴판 사진을 한 장 이상 올려주세요.");
    }

    const draft = await this.menuDraftService.draftFromImages(
      client,
      storeId,
      files.map((file) => file.buffer)
    );

    return menuDraftResponseSchema.parse(draft);
  }
}
