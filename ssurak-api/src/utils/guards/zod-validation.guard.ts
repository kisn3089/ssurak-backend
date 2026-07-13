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
