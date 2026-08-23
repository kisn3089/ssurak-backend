import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { PrismaService } from "src/prisma/prisma.service";
import { StorageService } from "src/storage/storage.service";
import { MenuPurgeService } from "src/stores/menu/menu-purge.service";
import { MENU_RETENTION_MS } from "src/stores/menu/menu-retention.const";

const IMAGE_KEY = "menu/vces0z57pr4vwbhbmlnbzb5a";

const prisma = mockDeep<PrismaService>();
const storage = mockDeep<StorageService>();

const service = new MenuPurgeService(prisma, storage);

/** 1단계 대상(이미지 보유) / 2단계 대상(이미지 회수 완료) 응답을 순서대로 물린다. */
const stageTargets = (
  withImage: { id: bigint; imageKey: string | null }[],
  reclaimed: { id: bigint; _count: { orderItems: number } }[]
) => {
  prisma.menu.findMany
    .mockResolvedValueOnce(withImage as never)
    .mockResolvedValueOnce(reclaimed as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.menuOptionGroup.deleteMany.mockResolvedValue({ count: 0 } as never);
  prisma.menu.deleteMany.mockResolvedValue({ count: 0 } as never);
});

describe("MenuPurgeService", () => {
  it("보관 기간이 지난 삭제만 대상으로 삼는다", async () => {
    stageTargets([], []);

    const before = Date.now();
    await service.purgeExpiredMenus();

    const [firstQuery] = prisma.menu.findMany.mock.calls[0]!;
    const cutoff = (firstQuery!.where!.deletedAt as { lt: Date }).lt;

    // 지금으로부터 보관 기간 이전 시각이어야 한다(실행 시간만큼의 오차 허용).
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(
      before - MENU_RETENTION_MS - 1_000
    );
    expect(cutoff.getTime()).toBeLessThanOrEqual(
      Date.now() - MENU_RETENTION_MS
    );
  });

  it("이미지를 trash로 옮긴 뒤에만 imageKey를 비운다", async () => {
    stageTargets([{ id: 1n, imageKey: IMAGE_KEY }], []);

    const summary = await service.purgeExpiredMenus();

    expect(storage.trashMenuImage).toHaveBeenCalledWith(IMAGE_KEY);
    expect(prisma.menu.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { imageKey: null },
    });
    expect(summary?.imagesReclaimed).toBe(1);
  });

  it("이미지 이동이 실패하면 imageKey를 남겨 다음 실행이 재시도하게 한다", async () => {
    stageTargets([{ id: 1n, imageKey: IMAGE_KEY }], []);
    storage.trashMenuImage.mockRejectedValueOnce(new Error("S3 down"));

    const summary = await service.purgeExpiredMenus();

    expect(prisma.menu.update).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ imagesReclaimed: 0, imageFailures: 1 });
  });

  it("한 건이 실패해도 나머지 메뉴는 계속 처리한다", async () => {
    stageTargets(
      [
        { id: 1n, imageKey: IMAGE_KEY },
        { id: 2n, imageKey: IMAGE_KEY },
      ],
      []
    );
    storage.trashMenuImage.mockRejectedValueOnce(new Error("S3 down"));

    const summary = await service.purgeExpiredMenus();

    expect(storage.trashMenuImage).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ imagesReclaimed: 1, imageFailures: 1 });
  });

  it("주문 이력이 없는 메뉴만 행까지 지우고 나머지는 tombstone으로 남긴다", async () => {
    stageTargets(
      [],
      [
        { id: 1n, _count: { orderItems: 0 } },
        { id: 2n, _count: { orderItems: 3 } },
      ]
    );
    prisma.menuOptionGroup.deleteMany.mockResolvedValue({ count: 5 } as never);
    prisma.menu.deleteMany.mockResolvedValue({ count: 1 } as never);

    const summary = await service.purgeExpiredMenus();

    // 옵션은 주문 이력과 무관하게 전부, 행 삭제는 이력 없는 것만.
    expect(prisma.menuOptionGroup.deleteMany).toHaveBeenCalledWith({
      where: { menuId: { in: [1n, 2n] } },
    });
    expect(prisma.menu.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [1n] } },
    });
    expect(summary).toMatchObject({
      optionGroupsDeleted: 5,
      menusDeleted: 1,
      tombstones: 1,
    });
  });

  it("정리할 행이 없으면 삭제 쿼리를 아예 보내지 않는다", async () => {
    stageTargets([], []);

    await service.purgeExpiredMenus();

    expect(prisma.menuOptionGroup.deleteMany).not.toHaveBeenCalled();
    expect(prisma.menu.deleteMany).not.toHaveBeenCalled();
  });

  it("실행이 겹치면 두 번째 호출은 건너뛴다", async () => {
    stageTargets([{ id: 1n, imageKey: IMAGE_KEY }], []);
    // 첫 실행을 1단계에서 멈춰 세운 뒤 같은 배치를 다시 호출한다.
    let releaseFirstRun!: () => void;
    storage.trashMenuImage.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        releaseFirstRun = resolve;
      })
    );

    const running = service.purgeExpiredMenus();
    await expect(service.purgeExpiredMenus()).resolves.toBeNull();

    releaseFirstRun();
    await running;
    expect(storage.trashMenuImage).toHaveBeenCalledTimes(1);
  });

  it("배치가 실패해도 예외를 밖으로 던지지 않는다(부팅을 막지 않는다)", async () => {
    prisma.menu.findMany.mockRejectedValueOnce(new Error("DB down"));

    await expect(service.purgeExpiredMenus()).resolves.toBeNull();
  });
});
