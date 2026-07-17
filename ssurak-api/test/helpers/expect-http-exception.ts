import { HttpException } from "@nestjs/common";
import { expect } from "vitest";

type ExpectedException = {
  code: string;
  status: number;
  details?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertHttpException(
  caught: unknown,
  expected: ExpectedException
): Record<string, unknown> {
  if (!(caught instanceof HttpException)) {
    throw new Error(
      `HttpException이 발생해야 합니다 — 실제: ${String(caught)}`
    );
  }
  expect(caught.getStatus()).toBe(expected.status);

  const response = caught.getResponse();
  if (!isRecord(response)) {
    throw new Error(`예외 응답이 객체여야 합니다 — 실제: ${String(response)}`);
  }
  expect(response.code).toBe(expected.code);
  if (expected.details !== undefined) {
    expect(response.details).toEqual(expected.details);
  }
  return response;
}

/**
 * fn 실행이 HttpException으로 실패하고, 응답 body의 code/status(/details)가
 * 기대값과 일치하는지 검증한다. 추가 검증을 위해 응답 body를 반환한다.
 */
export function expectHttpException(
  fn: () => unknown,
  expected: ExpectedException
): Record<string, unknown> {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  return assertHttpException(caught, expected);
}

/** expectHttpException의 async 버전. */
export async function expectHttpExceptionAsync(
  fn: () => Promise<unknown>,
  expected: ExpectedException
): Promise<Record<string, unknown>> {
  let caught: unknown;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  return assertHttpException(caught, expected);
}
