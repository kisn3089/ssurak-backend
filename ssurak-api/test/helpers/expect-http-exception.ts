import { HttpException } from "@nestjs/common";
import { expect } from "vitest";

type ExpectedException = {
  code: string;
  status: number;
  details?: unknown;
};

function assertHttpException(caught: unknown, expected: ExpectedException) {
  expect(caught, "HttpException이 발생해야 합니다").toBeInstanceOf(
    HttpException
  );
  const exception = caught as HttpException;
  expect(exception.getStatus()).toBe(expected.status);

  const response = exception.getResponse() as Record<string, unknown>;
  expect(response.code).toBe(expected.code);
  if (expected.details !== undefined) {
    expect(response.details).toEqual(expected.details);
  }
}

/**
 * fn 실행이 HttpException으로 실패하고, 응답 body의 code/status(/details)가
 * 기대값과 일치하는지 검증한다.
 */
export function expectHttpException(
  fn: () => unknown,
  expected: ExpectedException
): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assertHttpException(caught, expected);
}

/** expectHttpException의 async 버전. */
export async function expectHttpExceptionAsync(
  fn: () => Promise<unknown>,
  expected: ExpectedException
): Promise<void> {
  let caught: unknown;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  assertHttpException(caught, expected);
}
