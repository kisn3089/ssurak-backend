import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { Response } from "express";
import {
  FILE_FIELD_NAME,
  MAX_FILE_SIZE_MB,
} from "src/storage/storage.constants";

/**
 * multer 에러 메시지를 한글로 옮긴다.
 *
 * MulterError는 여기까지 도달하지 않는다. FileInterceptor가 내부에서 transformException으로
 * 이미 HttpException(PayloadTooLargeException / BadRequestException)으로 바꿔 던지기 때문에
 * `@Catch(MulterError)`는 발화하지 않는다. 그래서 변환된 예외의 영문 메시지를 되짚는다.
 *
 * 원문은 @nestjs/platform-express의 multerExceptions 상수를 따른다.
 */
const TRANSLATIONS: ReadonlyArray<{
  match: (message: string) => boolean;
  message: string;
}> = [
  {
    // LIMIT_FILE_SIZE. limits.fileSize 초과 시 multer가 스트리밍 도중 중단시킨다.
    match: (message) => message === "File too large",
    message: `파일 크기는 ${MAX_FILE_SIZE_MB}MB를 초과할 수 없습니다.`,
  },
  {
    // LIMIT_UNEXPECTED_FILE. 'Unexpected field - <fieldname>' 형태로 필드명이 붙는다.
    match: (message) => message.startsWith("Unexpected field"),
    message: `파일은 '${FILE_FIELD_NAME}' 필드로 하나만 업로드할 수 있습니다.`,
  },
  {
    match: (message) => message === "Too many files",
    message: `파일은 '${FILE_FIELD_NAME}' 필드로 하나만 업로드할 수 있습니다.`,
  },
  {
    match: (message) => message.startsWith("Multipart"),
    message: "multipart/form-data 형식이 올바르지 않습니다.",
  },
];

/**
 * MediaController에만 건다(@UseFilters). 전역이 아니므로 다른 라우트의 400은 영향받지 않는다.
 * 매칭되지 않는 예외(Zod 검증 실패, 컨트롤러가 직접 던진 400 등)는 원본 응답을 그대로 내보낸다.
 */
@Catch(PayloadTooLargeException, BadRequestException)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const translated = TRANSLATIONS.find((rule) =>
      rule.match(exception.message)
    );

    if (!translated) {
      response.status(status).json(exception.getResponse());
      return;
    }

    response.status(status).json({
      statusCode: status,
      message: translated.message,
    });
  }
}
