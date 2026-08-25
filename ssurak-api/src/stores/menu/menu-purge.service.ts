import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "src/prisma/prisma.service";
import { StorageService } from "src/storage/storage.service";
import {
  MENU_PURGE_BATCH_SIZE,
  MENU_RETENTION_DAYS,
  retentionCutoff,
} from "./menu-retention.const";
import { parseMenuPrefix } from "src/storage/image-key";
import { REDLOCK_CLIENT } from "src/redis/redis.module";
import { ExecutionError } from "redlock";
import type {
  RedlockAbortSignalLike,
  RedlockLike,
} from "src/redis/redlock.types";

const MENU_PURGE_LOCK_KEY = "lock:menu-purge";
const MENU_PURGE_LOCK_TTL_MS = 10_000;

const isExecutionError = (error: unknown): error is Error =>
  error instanceof ExecutionError;

export interface MenuPurgeSummary {
  /** 이미지를 trash로 옮기고 `imageKey`를 비운 메뉴 수 */
  imagesReclaimed: number;
  /** 이미지 회수에 실패해 다음 실행으로 미룬 메뉴 수 */
  imageFailures: number;
  /** 파싱에 실패한 imageKey 수 */
  invalidImageKeys: number;
  /** 삭제한 옵션 그룹 수 (선택지는 cascade로 함께 사라진다) */
  optionGroupsDeleted: number;
  /** 행까지 완전히 지운 메뉴 수 */
  menusDeleted: number;
  /** 주문 이력 때문에 행과 이미지를 남긴 메뉴 수 */
  tombstones: number;
}

@Injectable()
export class MenuPurgeService {
  private readonly logger = new Logger(MenuPurgeService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly storageService: StorageService,
    @Inject(REDLOCK_CLIENT) private readonly redlock: RedlockLike
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async purgeExpiredMenus(): Promise<MenuPurgeSummary | null> {
    try {
      // retryCount: 0 — 다른 인스턴스가 이미 돌고 있으면 기다리지 않고 넘긴다.
      const summary: MenuPurgeSummary = await this.redlock.using(
        [MENU_PURGE_LOCK_KEY],
        MENU_PURGE_LOCK_TTL_MS,
        { retryCount: 0 },
        async (signal: RedlockAbortSignalLike) => {
          const cutoff = retentionCutoff();
          const { imagesReclaimed, imageFailures, invalidImageKeys } =
            await this.reclaimImages(cutoff);

          if (signal.aborted) {
            throw signal.error ?? new Error("회수 배치가 락을 잃었습니다.");
          }

          const { optionGroupsDeleted, menusDeleted, tombstones } =
            await this.purgeRows(cutoff);

          return {
            imagesReclaimed,
            imageFailures,
            invalidImageKeys,
            optionGroupsDeleted,
            menusDeleted,
            tombstones,
          };
        }
      );

      if (
        summary.imagesReclaimed ||
        summary.imageFailures ||
        summary.invalidImageKeys ||
        summary.menusDeleted ||
        summary.tombstones
      ) {
        this.logger.log(
          `삭제 후 ${MENU_RETENTION_DAYS}일 지난 메뉴 회수 완료 ${JSON.stringify(summary)}`
        );
      }

      return summary;
    } catch (error) {
      if (isExecutionError(error)) {
        this.logger.warn(
          `회수 배치 락을 얻지 못해 이번 실행을 건너뜁니다: ${error.message}`
        );
        return null;
      }
      this.logger.error("메뉴 회수 배치가 실패했습니다.", error);
      return null;
    }
  }

  /** 1단계: 이미지를 trash로 옮기고 참조를 끊는다. */
  private async reclaimImages(cutoff: Date) {
    const targets = await this.prismaService.menu.findMany({
      where: {
        deletedAt: { lt: cutoff },
        imageKey: { not: null },
        orderItems: { none: {} },
      },
      select: { id: true, imageKey: true },
      take: MENU_PURGE_BATCH_SIZE,
      orderBy: { deletedAt: "asc" },
    });

    let imagesReclaimed = 0;
    let imageFailures = 0;
    let invalidImageKeys = 0;

    for (const menu of targets) {
      if (!menu.imageKey) continue;

      try {
        if (!parseMenuPrefix(menu.imageKey)) {
          await this.prismaService.menu.update({
            where: { id: menu.id },
            data: { imageKey: null },
          });
          invalidImageKeys += 1;
          this.logger.warn(
            `파싱 불가한 imageKey를 폐기 — menuId=${menu.id} imageKey=${menu.imageKey}`
          );
          continue;
        }

        await this.storageService.trashMenuImage(menu.imageKey);
        await this.prismaService.menu.update({
          where: { id: menu.id },
          data: { imageKey: null },
        });
        imagesReclaimed += 1;
      } catch (error) {
        imageFailures += 1;
        this.logger.error(
          `메뉴 이미지 회수 실패 — menuId=${menu.id} imageKey=${menu.imageKey}`,
          error
        );
      }
    }

    return { imagesReclaimed, imageFailures, invalidImageKeys };
  }

  /** 2단계: 이미지 처리가 끝난 메뉴의 행을 정리한다. */
  private async purgeRows(cutoff: Date) {
    const targets = await this.prismaService.menu.findMany({
      where: {
        deletedAt: { lt: cutoff },
        OR: [
          { imageKey: null, orderItems: { none: {} } },
          { orderItems: { some: {} }, options: { some: {} } },
        ],
      },
      select: { id: true, _count: { select: { orderItems: true } } },
      take: MENU_PURGE_BATCH_SIZE,
      orderBy: { deletedAt: "asc" },
    });

    if (targets.length === 0) {
      return { optionGroupsDeleted: 0, menusDeleted: 0, tombstones: 0 };
    }

    const deletableIds = targets
      .filter((menu) => menu._count.orderItems === 0)
      .map((menu) => menu.id);

    const { count: optionGroupsDeleted } =
      await this.prismaService.menuOptionGroup.deleteMany({
        where: { menuId: { in: targets.map((menu) => menu.id) } },
      });
    const { count: menusDeleted } = await this.prismaService.menu.deleteMany({
      where: { id: { in: deletableIds } },
    });

    return {
      optionGroupsDeleted,
      menusDeleted,
      tombstones: targets.length - deletableIds.length,
    };
  }
}
