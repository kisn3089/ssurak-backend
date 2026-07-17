import { describe, expect, it } from "vitest";
import { PublicStoreDto } from "src/dto/response/store.dto";

// StoresService가 넘겨주는 Prisma row 형태 (omit 누락 시 id/ownerId가 섞일 수 있음)
const storeRowFixture = () => ({
  publicId: "store-public-id",
  name: "쑤락 상점",
  phone: "02-1234-5678",
  address: "서울시 어딘가",
  addressDetail: null,
  businessHours: "09:00-22:00",
  description: null,
  isOpen: true,
  acceptedMessage: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
});

describe("PublicStoreDto.schema", () => {
  it("내부 식별자(id, ownerId)가 섞여 있어도 응답에서 제거된다", () => {
    const parsed = PublicStoreDto.schema.parse({
      ...storeRowFixture(),
      id: 42n,
      ownerId: 7n,
    });

    expect(parsed).not.toHaveProperty("id");
    expect(parsed).not.toHaveProperty("ownerId");
  });

  it("Date 필드를 ISO 8601 문자열로 직렬화한다", () => {
    const parsed = PublicStoreDto.schema.parse(storeRowFixture());

    expect(parsed.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(parsed.updatedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("캐시에서 복원된 ISO 문자열 날짜도 그대로 통과한다", () => {
    const parsed = PublicStoreDto.schema.parse({
      ...storeRowFixture(),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    expect(parsed.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("필수 필드가 빠지면 파싱에 실패한다", () => {
    const { name: _omitted, ...withoutName } = storeRowFixture();
    expect(() => PublicStoreDto.schema.parse(withoutName)).toThrow();
  });

  it("array() 파싱으로 목록 응답도 검증할 수 있다", () => {
    const parsed = PublicStoreDto.schema
      .array()
      .parse([storeRowFixture(), storeRowFixture()]);

    expect(parsed).toHaveLength(2);
  });
});
