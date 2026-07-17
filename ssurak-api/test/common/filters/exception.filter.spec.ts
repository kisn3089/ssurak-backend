import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import { HttpArgumentsHost } from "@nestjs/common/interfaces";
import { Prisma } from "@ssurak/db";
import { describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { GlobalExceptionFilter } from "src/common/filters/exception.filter";

type CapturedResponse = { status?: number; body?: Record<string, unknown> };

/** ArgumentsHost mock — 응답으로 내려간 status/body를 캡처한다 */
function catchWith(exception: unknown, url = "/test-path"): CapturedResponse {
  const captured: CapturedResponse = {};
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
      return this;
    },
  };
  const httpHost = mockDeep<HttpArgumentsHost>();
  httpHost.getResponse.mockReturnValue(response);
  httpHost.getRequest.mockReturnValue({ url });

  const host = mockDeep<ArgumentsHost>();
  host.switchToHttp.mockReturnValue(httpHost);

  new GlobalExceptionFilter().catch(exception, host);
  return captured;
}

const prismaError = (
  code: string,
  meta?: Record<string, unknown>
): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError("prisma error", {
    code,
    clientVersion: "6.0.0",
    meta,
  });

describe("GlobalExceptionFilter — Prisma 에러 매핑", () => {
  it("P2002(unique 위반)는 409 UNIQUE_CONSTRAINT_VIOLATION + 한국어 필드명", () => {
    const { status, body } = catchWith(
      prismaError("P2002", { target: "owner_email_key" })
    );

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body?.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
    expect(body?.message).toContain("이메일");
  });

  it("P2025(레코드 없음)는 404 RESOURCE_NOT_FOUND", () => {
    const { status, body } = catchWith(
      prismaError("P2025", { modelName: "Store" })
    );

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body?.code).toBe("RESOURCE_NOT_FOUND");
    expect(body?.message).toContain("매장");
  });

  it("P2003(FK 위반)는 400 FOREIGN_KEY_CONSTRAINT_VIOLATION", () => {
    const { status, body } = catchWith(
      prismaError("P2003", { field_name: "store_id" })
    );

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body?.code).toBe("FOREIGN_KEY_CONSTRAINT_VIOLATION");
  });

  it("그 외 Prisma known 에러는 400 PRISMA_ERROR로 뭉뚱그린다", () => {
    const { status, body } = catchWith(prismaError("P2034"));

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body?.code).toBe("PRISMA_ERROR");
    expect(body?.details).toEqual({ prismaCode: "P2034" });
  });
});

describe("GlobalExceptionFilter — HttpException 매핑", () => {
  it("code/details가 있는 커스텀 예외는 그대로 내려간다", () => {
    const { status, body } = catchWith(
      new HttpException(
        { code: "MENU_MISMATCH", message: "메뉴 없음", details: { x: 1 } },
        HttpStatus.BAD_REQUEST
      )
    );

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body?.code).toBe("MENU_MISMATCH");
    expect(body?.details).toEqual({ x: 1 });
  });

  it("code가 없는 기본 예외는 상태 코드에서 code를 유도한다", () => {
    const { body } = catchWith(new NotFoundException());
    expect(body?.code).toBe("NOT_FOUND");
    expect(body?.error).toBe("Not Found");
  });

  it("path와 timestamp가 응답에 포함된다", () => {
    const { body } = catchWith(new NotFoundException(), "/stores/v1/abc");
    expect(body?.path).toBe("/stores/v1/abc");
    expect(typeof body?.timestamp).toBe("string");
  });
});

describe("GlobalExceptionFilter — 알 수 없는 예외", () => {
  it("HttpException이 아닌 예외는 500 INTERNAL_SERVER_ERROR로 감춘다", () => {
    const { status, body } = catchWith(new Error("DB 비밀번호는 hunter2"));

    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body?.code).toBe("INTERNAL_SERVER_ERROR");
    // 내부 메시지가 응답으로 새면 안 된다
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });
});
