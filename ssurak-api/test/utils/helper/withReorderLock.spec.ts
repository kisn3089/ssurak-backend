import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { HttpStatus } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { expectHttpExceptionAsync } from "test/helpers/expect-http-exception";
import {
  REORDER_TX_TIMEOUT_MS,
  withReorderLock,
} from "src/utils/helper/withReorderLock";

const STORE_ID = "store-public-id";
const LOCK_NAME = `reorder:${STORE_ID}`;

/** 인터랙티브 트랜잭션이 넘겨주는 tx 클라이언트 자리. */
const tx = mockDeep<PrismaService>();

/** Prisma.sql 태그드 템플릿에서 SQL 본문과 바인딩 값을 꺼낸다. */
const sqlOf = (call: unknown[]) => {
  const [sql] = call as [{ strings?: string[]; values?: unknown[] }];
  return { text: sql.strings?.join("") ?? "", values: sql.values ?? [] };
};

beforeEach(() => {
  tx.$queryRaw.mockReset();
  // GET_LOCK 획득 성공이 기본값.
  tx.$queryRaw.mockResolvedValue([{ acquired: 1 }]);
});

describe("withReorderLock 락 획득", () => {
  it("매장별 이름으로 3초까지만 기다린다", async () => {
    await withReorderLock(tx, STORE_ID, async () => "ok");

    const acquire = sqlOf(tx.$queryRaw.mock.calls[0]);
    expect(acquire.text).toContain("GET_LOCK");
    // 이름이 매장별이라 다른 매장의 재정렬끼리는 서로 막지 않는다.
    // 3초를 넘기면 REORDER_TX_TIMEOUT_MS의 작업 예산 계산이 깨진다.
    expect(acquire.values).toEqual([LOCK_NAME, 3]);
  });

  it("트랜잭션 timeout은 락 대기(3초) + 작업 예산(5초)이다", () => {
    // 기본값 5초를 그대로 쓰면 3초를 기다린 요청에 2초만 남아 P2028이 나고,
    // ORM 레벨 오류가 집합 검증을 선점해 409 대신 400(PRISMA_ERROR)이 나간다.
    expect(REORDER_TX_TIMEOUT_MS).toBe(8_000);
  });
});

describe("withReorderLock 락 실패", () => {
  const expectInProgress = (fn: () => Promise<unknown>) =>
    expectHttpExceptionAsync(fn, {
      code: "REORDER_IN_PROGRESS",
      status: HttpStatus.CONFLICT,
    });

  it("0(대기 타임아웃)이면 작업을 실행하지 않고 409를 던진다", async () => {
    tx.$queryRaw.mockResolvedValue([{ acquired: 0 }]);
    const work = vi.fn();

    await expectInProgress(() => withReorderLock(tx, STORE_ID, work));

    expect(work).not.toHaveBeenCalled();
    // 잡지도 않은 락을 푸는 쿼리가 나가면 안 된다.
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("NULL(GET_LOCK 에러)도 409로 묶는다", async () => {
    // Number(null)은 0이라 획득 실패와 같은 분기를 탄다.
    tx.$queryRaw.mockResolvedValue([{ acquired: null }]);

    await expectInProgress(() => withReorderLock(tx, STORE_ID, async () => "ok"));
  });

  it("빈 결과가 와도 획득으로 오인하지 않는다", async () => {
    tx.$queryRaw.mockResolvedValue([]);

    await expectInProgress(() => withReorderLock(tx, STORE_ID, async () => "ok"));
  });
});

describe("withReorderLock 락 해제", () => {
  it("작업 결과를 그대로 돌려주고 COMMIT 전에 해제한다", async () => {
    const result = await withReorderLock(tx, STORE_ID, async () => ["a", "b"]);

    expect(result).toEqual(["a", "b"]);

    const release = sqlOf(tx.$queryRaw.mock.calls.at(-1)!);
    expect(release.text).toContain("RELEASE_LOCK");
    expect(release.values).toEqual([LOCK_NAME]);
  });

  it("작업이 실패해도 해제한다", async () => {
    // GET_LOCK은 세션 락이라 ROLLBACK으로 풀리지 않는다. finally를 빠뜨리면
    // 커넥션이 풀로 반납된 뒤에도 락이 남아 이후 재정렬이 전부 409가 된다.
    const failure = new Error("집합 불일치");

    await expect(
      withReorderLock(tx, STORE_ID, () => Promise.reject(failure))
    ).rejects.toThrowError(failure);

    const release = sqlOf(tx.$queryRaw.mock.calls.at(-1)!);
    expect(release.text).toContain("RELEASE_LOCK");
  });
});
