import { BadRequestException } from "@nestjs/common";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";
import { IMAGE_MIME } from "./storage.constants";

/** 확장자가 아니라 클라이언트가 붙인 MIME으로 1차 거른다. */
const imageFileFilter: NonNullable<MulterOptions["fileFilter"]> = (
  _req,
  file,
  callback
) => {
  if (!IMAGE_MIME.test(file.mimetype)) {
    callback(
      new BadRequestException(
        "png, jpg, jpeg, webp, gif, avif, tiff, heic 파일만 업로드할 수 있습니다."
      ),
      false
    );
    return;
  }
  callback(null, true);
};

/** 이미지 업로드 라우트가 공유하는 multer 설정. 상한만 라우트별로 다르다. */
export const imageUploadOptions = (maxFileSize: number): MulterOptions => ({
  limits: { fileSize: maxFileSize },
  fileFilter: imageFileFilter,
  defParamCharset: "utf8",
});
