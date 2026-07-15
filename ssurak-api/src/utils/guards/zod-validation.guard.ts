import {
  CanActivate,
  ExecutionContext,
  Injectable,
  mixin,
  Type,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import {
  ExceptionContentKeys,
  exceptionContentsIs,
} from "src/common/constants/exceptionContents";
import { ZodError, ZodSchema } from "zod";

interface Schemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
  /**
   * 검증 실패 시 기본 400(ZOD_*_FAILED) 대신 던질 예외.
   * 지정하면 zod details를 응답에 포함하지 않는다 — 로그인처럼
   * 실패 사유를 노출하면 안 되는 엔드포인트에서 사용한다.
   */
  exception?: {
    content: ExceptionContentKeys;
    status: HttpStatus;
  };
}

export function ZodValidation(schemas: Schemas): Type<CanActivate> {
  @Injectable()
  class ZodValidationGuardMixin implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest();
      const { body, params, query } = request;

      if (schemas?.params && params) {
        const parsedParams = this.tryParseSchema(
          schemas.params,
          params,
          "ZOD_PARAMS_FAILED"
        );
        request.params = parsedParams;
      }

      if (schemas?.query && query) {
        const queryResult = this.tryParseSchema(
          schemas.query,
          query,
          "ZOD_QUERY_FAILED"
        );
        /** express request의 query는 read-only이기 때문에 재정의를 통해 변경한다. */
        Object.defineProperty(request, "query", {
          value: queryResult,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }

      if (schemas?.body && body) {
        const parsedPayload = this.tryParseSchema(
          schemas.body,
          body,
          "ZOD_PAYLOAD_FAILED"
        );
        request.body = parsedPayload;
      }
      return true;
    }

    private tryParseSchema<T>(
      schema: ZodSchema<T>,
      data: unknown,
      exceptionError: ExceptionContentKeys
    ) {
      try {
        return schema.parse(data);
      } catch (error: unknown) {
        if (error instanceof ZodError) {
          if (schemas.exception) {
            throw new HttpException(
              exceptionContentsIs(schemas.exception.content),
              schemas.exception.status
            );
          }
          throw new HttpException(
            {
              ...exceptionContentsIs(exceptionError),
              details: error.errors,
            },
            HttpStatus.BAD_REQUEST
          );
        }
        console.warn("zod-validator exception: ", error);
        throw new Error(`zod-validator exception ${JSON.stringify(error)}`);
      }
    }
  }

  return mixin(ZodValidationGuardMixin);
}
