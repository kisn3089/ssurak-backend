import { describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import {
  menuPrefixOf,
  objectKeyOf,
  parseOwnedTmpPrefix,
  tmpPrefixOf,
} from "src/storage/image-key";

const OWNER = "owner1publicid0000000000";
const OTHER_OWNER = "owner2publicid0000000000";

describe("parseOwnedTmpPrefix", () => {
  it("본인이 올린 임시 키는 이미지 id를 돌려준다", () => {
    const id = createId();

    expect(parseOwnedTmpPrefix(tmpPrefixOf(OWNER, id), OWNER)).toEqual({ id });
  });

  it("다른 사람의 임시 키는 거절한다", () => {
    const foreign = tmpPrefixOf(OTHER_OWNER, createId());

    expect(parseOwnedTmpPrefix(foreign, OWNER)).toBeNull();
  });

  it("상위 경로 이스케이프가 섞인 키는 거절한다", () => {
    expect(
      parseOwnedTmpPrefix(`tmp/${OWNER}/../menu/stolen`, OWNER)
    ).toBeNull();
    expect(
      parseOwnedTmpPrefix(`tmp/../${OWNER}/${createId()}`, OWNER)
    ).toBeNull();
  });

  it("세그먼트 개수가 다르면 거절한다", () => {
    const id = createId();

    expect(parseOwnedTmpPrefix(`tmp/${OWNER}`, OWNER)).toBeNull();
    expect(
      parseOwnedTmpPrefix(`tmp/${OWNER}/${id}/hero.webp`, OWNER)
    ).toBeNull();
    expect(parseOwnedTmpPrefix("", OWNER)).toBeNull();
  });

  it("id가 cuid2 형식이 아니면 거절한다", () => {
    expect(parseOwnedTmpPrefix(`tmp/${OWNER}/not-a-cuid!!`, OWNER)).toBeNull();
  });

  it("이미 확정된 정식 키를 임시 키로 오인하지 않는다", () => {
    const promoted = menuPrefixOf(createId());

    expect(parseOwnedTmpPrefix(promoted, OWNER)).toBeNull();
  });
});

describe("objectKeyOf", () => {
  it("prefix와 variant를 webp 확장자로 잇는다", () => {
    expect(objectKeyOf("menu/abc", "hero")).toBe("menu/abc/hero.webp");
  });
});
