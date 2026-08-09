/// <reference types="multer" />
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Owner } from "@ssurak/db";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Client } from "src/decorators/client.decorator";
import { MulterExceptionFilter } from "./filter/multer-exception.filter";
import { imageUploadOptions } from "./image-upload.options";
import {
  FILE_FIELD_NAME,
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_MB,
} from "./storage.constants";
import { StorageService } from "./storage.service";

@Controller()
@UseGuards(JwtAuthGuard)
@UseFilters(
  MulterExceptionFilter({ maxFileSizeMb: MAX_FILE_SIZE_MB, maxCount: 1 })
)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor(FILE_FIELD_NAME, imageUploadOptions(MAX_FILE_SIZE))
  )
  async upload(
    @Client() owner: Owner,
    @UploadedFile() file: Express.Multer.File | undefined
  ) {
    if (!file) {
      throw new BadRequestException("업로드할 파일이 없습니다.");
    }
    return this.storageService.saveImage(file.buffer, owner.publicId);
  }
}
