import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
} from "@nestjs/common";
import type { Owner } from "@ssurak/db";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Client } from "src/decorators/client.decorator";
import { ImageUpload } from "./image-upload.decorator";
import { MAX_UPLOAD_IMAGE_FILE_SIZE_MB } from "./storage.constants";
import { StorageService } from "./storage.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post()
  @ImageUpload({ maxFileSizeMb: MAX_UPLOAD_IMAGE_FILE_SIZE_MB, maxCount: 1 })
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
