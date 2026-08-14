import { applyDecorators, UseFilters, UseInterceptors } from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import {
  MulterExceptionFilter,
  type MulterLimits,
} from "./filter/multer-exception.filter";
import { imageUploadOptions } from "./image-upload.options";
import { FILE_FIELD_NAME } from "./storage.constants";

/** 이미지 업로드 라우트의 인터셉터와 에러 문구를 하나의 limits에서 함께 만든다. */
export const ImageUpload = ({ maxFileSizeMb, maxCount }: MulterLimits) => {
  const options = imageUploadOptions(maxFileSizeMb * 1024 * 1024);

  return applyDecorators(
    UseInterceptors(
      maxCount === 1
        ? FileInterceptor(FILE_FIELD_NAME, options)
        : FilesInterceptor(FILE_FIELD_NAME, maxCount, options)
    ),
    UseFilters(MulterExceptionFilter({ maxFileSizeMb, maxCount }))
  );
};
