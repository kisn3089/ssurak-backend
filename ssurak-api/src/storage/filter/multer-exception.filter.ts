import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  mixin,
  PayloadTooLargeException,
  Type,
} from "@nestjs/common";
import { GlobalExceptionFilter } from "src/common/filters/exception.filter";
import { FILE_FIELD_NAME } from "src/storage/storage.constants";

export interface MulterLimits {
  maxFileSizeMb: number;
  /** 이 필드로 받을 수 있는 파일 수. 메시지 문구가 갈린다. */
  maxCount: number;
}

interface Translation {
  match: (message: string) => boolean;
  message: string;
}

/**
 * 상한이 엔드포인트마다 다르므로(메뉴 이미지 5MB 1장 / 메뉴판 사진 12MB 3장)
 * 문구를 실제 limits에서 만든다. 상수를 직접 읽으면 한쪽 엔드포인트의 안내가
 * 조용히 틀린 숫자를 말하게 된다.
 */
const translationsOf = ({
  maxFileSizeMb,
  maxCount,
}: MulterLimits): Translation[] => {
  const countHint =
    maxCount === 1
      ? `파일은 '${FILE_FIELD_NAME}' 필드로 하나만 업로드할 수 있습니다.`
      : `파일은 '${FILE_FIELD_NAME}' 필드로 최대 ${maxCount}개까지 업로드할 수 있습니다.`;

  return [
    {
      match: (message) => message === "File too large",
      message: `파일 크기는 ${maxFileSizeMb}MB를 초과할 수 없습니다.`,
    },
    {
      match: (message) => message.startsWith("Unexpected field"),
      message: countHint,
    },
    {
      match: (message) => message === "Too many files",
      message: countHint,
    },
    {
      match: (message) => message.startsWith("Multipart"),
      message: "multipart/form-data 형식이 올바르지 않습니다.",
    },
  ];
};

/**
 * multer 에러 메시지를 한글로 옮긴다.
 *
 * MulterError는 여기까지 도달하지 않는다. FileInterceptor가 내부에서 transformException으로
 * 이미 HttpException(PayloadTooLargeException / BadRequestException)으로 바꿔 던지기 때문에
 * `@Catch(MulterError)`는 발화하지 않는다. 그래서 변환된 예외의 영문 메시지를 되짚는다.
 *
 * 업로드 라우트에만 건다(@UseFilters). 전역이 아니므로 다른 라우트의 400은 영향받지 않는다.
 * 매칭되지 않는 예외(Zod 검증 실패, 컨트롤러가 직접 던진 400 등)는 원본 응답을 그대로 내보낸다.
 */

export function MulterExceptionFilter(
  limits: MulterLimits
): Type<ExceptionFilter> {
  const translations = translationsOf(limits);
  const globalFilter = new GlobalExceptionFilter();

  @Catch(PayloadTooLargeException, BadRequestException)
  class MulterExceptionFilterMixin implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost) {
      const translated = translations.find((rule) =>
        rule.match(exception.message)
      );

      if (!translated) return globalFilter.catch(exception, host);

      return globalFilter.catch(
        new HttpException(translated.message, exception.getStatus()),
        host
      );
    }
  }

  return mixin(MulterExceptionFilterMixin);
}
