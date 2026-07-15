import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ExtendedMap } from "src/utils/helper/extendMap";
import { expectHttpException } from "test/helpers/expect-http-exception";

describe("ExtendedMap.getOrThrow", () => {
  it("존재하는 키는 값을 반환한다", () => {
    const map = new ExtendedMap<string, number>([["a", 1]]);
    expect(map.getOrThrow("a")).toBe(1);
  });

  it("없는 키는 기본 BADREQUEST(400)와 missingKey를 던진다", () => {
    const map = new ExtendedMap<string, number>();
    expectHttpException(() => map.getOrThrow("ghost"), {
      code: "BADREQUEST",
      status: HttpStatus.BAD_REQUEST,
      details: { missingKey: "ghost" },
    });
  });

  it("setException으로 예외 코드와 상태를 바꿀 수 있다", () => {
    const map = new ExtendedMap<string, number>();
    map.setException("MENU_MISMATCH", HttpStatus.NOT_FOUND);

    expectHttpException(() => map.getOrThrow("ghost"), {
      code: "MENU_MISMATCH",
      status: HttpStatus.NOT_FOUND,
      details: { missingKey: "ghost" },
    });
  });

  it("setException에 상태를 생략하면 코드만 바뀌고 상태는 유지된다", () => {
    const map = new ExtendedMap<string, number>();
    map.setException("MENU_OPTIONS_INVALID");

    expectHttpException(() => map.getOrThrow("ghost"), {
      code: "MENU_OPTIONS_INVALID",
      status: HttpStatus.BAD_REQUEST,
    });
  });
});
