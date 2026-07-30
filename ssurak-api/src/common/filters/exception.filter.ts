import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  HttpException,
  BadRequestException,
} from "@nestjs/common";
import { Exception } from "@ssurak/schema";
import { Prisma } from "@ssurak/db";
import { Request, Response } from "express";

type Replace<
  S extends string,
  From extends string,
  To extends string,
> = S extends `${infer Start}${From}${infer End}`
  ? `${Start}${To}${Replace<End, From, To>}`
  : S;

type ReturnHttpCode<T extends Record<string, string>> =
  Uppercase<Replace<T[keyof T], " ", "_">> | "HTTP_EXCEPTION";

type ReplacedString<T extends string> = Uppercase<Replace<T, " ", "_">>;

type HttpExceptionBody = {
  message?: string | string[];
  error?: string;
  code?: string;
  details?: unknown;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const path = request.url;
    const timestamp = new Date().toISOString();

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const retrievedPrismaException = this.findPrismaException(
        exception,
        request,
        {
          path,
          timestamp,
        }
      );
      return response
        .status(retrievedPrismaException.status)
        .json(retrievedPrismaException);
    }

    if (exception instanceof HttpException) {
      const retrievedHttpException = this.findHttpException(exception, {
        path,
        timestamp,
      });
      return response
        .status(retrievedHttpException.status)
        .json(retrievedHttpException);
    }

    console.error("Unknown exception caught:", exception);
    const unknownException: Exception = {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: "Internal Server Error",
      message: "Internal server error",
      code: "INTERNAL_SERVER_ERROR",
      path,
      timestamp,
    };
    return response.status(unknownException.status).json(unknownException);
  }

  private findPrismaException(
    exception: Prisma.PrismaClientKnownRequestError,
    request: Request,
    ctx: { path: string; timestamp: string }
  ): Exception {
    switch (exception.code) {
      case "P2002": {
        // Unique constraint violation
        const exceptionFields = exception.meta?.target as string | string[];
        const fieldName = Array.isArray(exceptionFields)
          ? exceptionFields.join(", ")
          : exceptionFields;

        const translatedFieldName = this.translateFieldName(fieldName);

        return {
          status: HttpStatus.CONFLICT,
          error: "Conflict",
          message: `이미 사용 중인 ${translatedFieldName} 입니다.`,
          code: "UNIQUE_CONSTRAINT_VIOLATION",
          path: ctx.path,
          timestamp: ctx.timestamp,
        };
      }

      // Record not found
      case "P2025": {
        const extractedModelName = this.extractModelName(exception.meta);
        const extractedUrl = this.extractUrl(request.url);
        return {
          status: HttpStatus.NOT_FOUND,
          error: "Not Found",
          message: extractedUrl
            ? `${this.translateFieldName(extractedModelName)} ID ${extractedUrl}를 찾을 수 없습니다.`
            : `해당 ${this.translateFieldName(extractedModelName)}를 찾을 수 없습니다.`,
          code: "RESOURCE_NOT_FOUND",
          path: ctx.path,
          timestamp: ctx.timestamp,
          details: {
            resource: extractedModelName,
            prismaCode: exception.code,
          },
        };
      }

      case "P2003": {
        // Foreign key constraint failed
        const exceptionFieldName = exception.meta?.field_name as string;
        return {
          status: HttpStatus.BAD_REQUEST,
          error: "Bad Request",
          message: exceptionFieldName
            ? `유효하지 않은 ${exceptionFieldName} 값입니다.`
            : "유효하지 않은 데이터입니다.",
          code: "FOREIGN_KEY_CONSTRAINT_VIOLATION",
          path: ctx.path,
          timestamp: ctx.timestamp,
        };
      }

      default: {
        return {
          status: HttpStatus.BAD_REQUEST,
          error: "Bad Request",
          message: "데이터 처리 중 오류가 발생했습니다.",
          code: "PRISMA_ERROR",
          path: ctx.path,
          timestamp: ctx.timestamp,
          details: { prismaCode: exception.code },
        };
      }
    }
  }

  private findHttpException(
    exception: HttpException,
    ctx: { path: string; timestamp: string }
  ): Exception {
    const status = exception.getStatus();
    const res = exception.getResponse();

    if (typeof res === "string") {
      return {
        status,
        error: this.httpErrorName(status),
        message: res,
        code: this.httpCode(status),
        path: ctx.path,
        timestamp: ctx.timestamp,
      };
    }

    if (!this.isHttpExceptionBody(res)) {
      return {
        status,
        error: this.httpErrorName(status),
        message: "요청 처리 중 오류가 발생했습니다.",
        code: this.httpCode(status),
        path: ctx.path,
        timestamp: ctx.timestamp,
      };
    }

    // ValidationPipe의 BadRequestException 포맷 표준화
    if (
      exception instanceof BadRequestException &&
      Array.isArray(res.message)
    ) {
      return {
        status,
        error: res.error ?? "Bad Request",
        message: res.message, // string[]
        code: res.code ?? "VALIDATION_FAILED",
        path: ctx.path,
        timestamp: ctx.timestamp,
        details: res.details,
      };
    }

    return {
      status,
      error: res.error ?? this.httpErrorName(status),
      message: res.message ?? "요청 처리 중 오류가 발생했습니다.",
      code: res.code ?? this.httpCode(status),
      path: ctx.path,
      timestamp: ctx.timestamp,
      details: res.details,
    };
  }

  private readonly httpErrorStatusRecord = {
    [HttpStatus.BAD_REQUEST]: "Bad Request", // 400
    [HttpStatus.UNAUTHORIZED]: "Unauthorized", // 401
    [HttpStatus.FORBIDDEN]: "Forbidden", // 403
    [HttpStatus.NOT_FOUND]: "Not Found", // 404
    [HttpStatus.REQUEST_TIMEOUT]: "Request Timeout", // 408
    [HttpStatus.CONFLICT]: "Conflict", // 409
    419: "Authentication Timeout",
  } as const;

  private isHttpErrorStatus(
    status: number
  ): status is keyof typeof this.httpErrorStatusRecord {
    return status in this.httpErrorStatusRecord;
  }

  private httpErrorName(status: number) {
    if (this.isHttpErrorStatus(status)) {
      const httpName = this.httpErrorStatusRecord[status];
      return httpName;
    }
    console.warn("not defined error status: ", status);
    return "Error";
  }

  /** Bad Request -> BAD_REQUEST */
  private httpCode(
    status: number
  ): ReturnHttpCode<typeof this.httpErrorStatusRecord> {
    if (this.isHttpErrorStatus(status)) {
      const errorName = this.httpErrorStatusRecord[status];
      return errorName.toUpperCase().replace(/ /g, "_") as ReplacedString<
        typeof errorName
      >;
    }
    return "HTTP_EXCEPTION";
  }

  private isHttpExceptionBody(res: object): res is HttpExceptionBody {
    return "message" in res;
  }

  private extractModelName(
    meta: { modelName?: string; cause?: string } | undefined
  ): string {
    // Prisma meta에서 모델 이름 추출 (예: "Admin", "Owner" 등)
    const modelName = meta?.modelName || meta?.cause || "unknown model";
    return modelName;
  }

  private extractUrl(url: string): string | null {
    // CUID 형식 추출 (소문자 영숫자, 일반적으로 25자)
    const match = url.match(/\/([a-z0-9]{20,})(?:[/?]|$)/);
    return match ? match[1] : null;
  }

  private translateFieldName(fieldName: string | undefined): string {
    // 필드명을 한국어로 번역
    const translateKoreanRecord: Record<string, string> = {
      admin_email_key: "이메일",
      owner_email_key: "이메일",
      category_store_id_name_key: "카테고리 이름",
      // domain models
      Admin: "관리자",
      Owner: "매니저",
      Store: "매장",
      Category: "카테고리",
      Table: "테이블",
      QRCode: "QR 코드",
      CartItem: "장바구니 항목",
      Menu: "메뉴",
      Order: "주문",
      OrderItem: "주문 항목",
      TableSession: "테이블 세션",
    };
    return (
      translateKoreanRecord[fieldName || ""] || fieldName || "unkown model"
    );
  }
}
