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
import {
  FILE_FIELD_NAME,
  IMAGE_MIME,
  MAX_FILE_SIZE,
} from "./storage.constants";
import { StorageService } from "./storage.service";

@Controller()
@UseGuards(JwtAuthGuard)
@UseFilters(MulterExceptionFilter)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor(FILE_FIELD_NAME, {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, callback) => {
        if (!IMAGE_MIME.test(file.mimetype)) {
          callback(
            new BadRequestException(
              "png, jpg, jpeg, webp, gif, avif, tiff 파일만 업로드할 수 있습니다."
            ),
            false
          );
          return;
        }
        callback(null, true);
      },
    })
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
