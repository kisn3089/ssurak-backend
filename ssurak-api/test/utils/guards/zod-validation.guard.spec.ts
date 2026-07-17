import { ExecutionContext, HttpStatus } from "@nestjs/common";
import { HttpArgumentsHost } from "@nestjs/common/interfaces";
import { describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import z from "zod";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import { expectHttpException } from "test/helpers/expect-http-exception";

type MutableRequest = {
  body?: unknown;
  params?: unknown;
  query?: unknown;
};

const contextOf = (request: MutableRequest): ExecutionContext => {
  const httpHost = mockDeep<HttpArgumentsHost>();
  httpHost.getRequest.mockReturnValue(request);

  const context = mockDeep<ExecutionContext>();
  context.switchToHttp.mockReturnValue(httpHost);
  return context;
};

const runGuard = (
  schemas: Parameters<typeof ZodValidation>[0],
  request: MutableRequest
) => {
  const GuardClass = ZodValidation(schemas);
  return new GuardClass().canActivate(contextOf(request));
};

const bodySchema = z.object({ name: z.string() }).strict();

describe("ZodValidation guard", () => {
  it("유효한 body는 파싱 결과로 교체하고 통과시킨다", () => {
    const request: MutableRequest = { body: { name: "쑤락" } };

    expect(runGuard({ body: bodySchema }, request)).toBe(true);
    expect(request.body).toEqual({ name: "쑤락" });
  });

  it("잘못된 body는 400 ZOD_PAYLOAD_FAILED + zod details", () => {
    expectHttpException(
      () => runGuard({ body: bodySchema }, { body: { name: 1 } }),
      { code: "ZOD_PAYLOAD_FAILED", status: HttpStatus.BAD_REQUEST }
    );
  });

  it("잘못된 params는 400 ZOD_PARAMS_FAILED", () => {
    const paramsSchema = z.object({ storeId: z.string().min(5) }).strict();

    expectHttpException(
      () => runGuard({ params: paramsSchema }, { params: { storeId: "x" } }),
      { code: "ZOD_PARAMS_FAILED", status: HttpStatus.BAD_REQUEST }
    );
  });

  it("query는 read-only여도 파싱 결과로 재정의된다", () => {
    const querySchema = z.object({ page: z.coerce.number() });
    const request: MutableRequest = {};
    Object.defineProperty(request, "query", {
      value: { page: "3" },
      writable: false,
      configurable: true,
    });

    expect(runGuard({ query: querySchema }, request)).toBe(true);
    expect(request.query).toEqual({ page: 3 });
  });

  it("exception 오버라이드 시 지정한 코드/상태로 던지고 details를 노출하지 않는다", () => {
    let caught: unknown;
    try {
      runGuard(
        {
          body: bodySchema,
          exception: {
            content: "SIGNIN_FAILED",
            status: HttpStatus.UNAUTHORIZED,
          },
        },
        { body: {} }
      );
    } catch (error) {
      caught = error;
    }

    const response = expectHttpException(
      () => {
        throw caught;
      },
      { code: "SIGNIN_FAILED", status: HttpStatus.UNAUTHORIZED }
    );
    expect(response).not.toHaveProperty("details");
  });

  it("스키마가 지정되지 않은 필드는 검증하지 않는다", () => {
    const request: MutableRequest = { body: { anything: true } };
    expect(runGuard({}, request)).toBe(true);
    expect(request.body).toEqual({ anything: true });
  });
});
