import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "src/prisma/prisma.service";
import { StorageService } from "src/storage/storage.service";
import {
  MENU_PURGE_BATCH_SIZE,
  MENU_RETENTION_DAYS,
  retentionCutoff,
} from "./menu-retention.const";

export interface MenuPurgeSummary {
  /** 이미지를 trash로 옮기고 `imageKey`를 비운 메뉴 수 */
  imagesReclaimed: number;
  /** 이미지 회수에 실패해 다음 실행으로 미룬 메뉴 수 */
  imageFailures: number;
  /** 삭제한 옵션 그룹 수 (선택지는 cascade로 함께 사라진다) */
  optionGroupsDeleted: number;
  /** 행까지 완전히 지운 메뉴 수 */
  menusDeleted: number;
  /** 주문 이력 때문에 행을 남긴 메뉴 수 */
  tombstones: number;
}

@Injectable()
export class MenuPurgeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MenuPurgeService.name);
  private isRunning = false;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly storageService: StorageService
  ) {}

  onApplicationBootstrap(): void {
    void this.purgeExpiredMenus();
  }

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async purgeExpiredMenus(): Promise<MenuPurgeSummary | null> {
    // 크론과 수동 실행이 겹치면 같은 메뉴를 두 번 옮기게 되므로 한 번에 하나만 돈다.
    if (this.isRunning) {
      this.logger.warn(
        "이전 회수 배치가 아직 실행 중이라 이번 실행은 건너뜁니다."
      );
      return null;
    }
    this.isRunning = true;

    try {
      const cutoff = retentionCutoff();
      const { imagesReclaimed, imageFailures } =
        await this.reclaimImages(cutoff);
      const { optionGroupsDeleted, menusDeleted, tombstones } =
        await this.purgeRows(cutoff);

      const summary: MenuPurgeSummary = {
        imagesReclaimed,
        imageFailures,
        optionGroupsDeleted,
        menusDeleted,
        tombstones,
      };

      // 아무것도 안 한 실행까지 남기면 로그만 쌓이므로 실제 변화가 있을 때만 남긴다.
      if (imagesReclaimed || imageFailures || menusDeleted || tombstones) {
        this.logger.log(
          `삭제 후 ${MENU_RETENTION_DAYS}일 지난 메뉴 회수 완료 ${JSON.stringify(summary)}`
        );
      }

      return summary;
    } catch (error) {
      this.logger.error("메뉴 회수 배치가 실패했습니다.", error);
      return null;
    } finally {
      this.isRunning = false;
    }
  }

  /** 1단계: 이미지를 trash로 옮기고 참조를 끊는다. */
  private async reclaimImages(cutoff: Date) {
    const targets = await this.prismaService.menu.findMany({
      where: { deletedAt: { lt: cutoff }, imageKey: { not: null } },
      select: { id: true, imageKey: true },
      take: MENU_PURGE_BATCH_SIZE,
    });

    let imagesReclaimed = 0;
    let imageFailures = 0;

    for (const menu of targets) {
      if (!menu.imageKey) continue;

      try {
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

    return { imagesReclaimed, imageFailures };
  }

  /** 2단계: 이미지 회수가 끝난 메뉴의 행을 정리한다. */
  private async purgeRows(cutoff: Date) {
    const reclaimed = await this.prismaService.menu.findMany({
      where: {
        deletedAt: { lt: cutoff },
        imageKey: null,
        OR: [{ options: { some: {} } }, { orderItems: { none: {} } }],
      },
      select: { id: true, _count: { select: { orderItems: true } } },
      take: MENU_PURGE_BATCH_SIZE,
    });

    if (reclaimed.length === 0) {
      return { optionGroupsDeleted: 0, menusDeleted: 0, tombstones: 0 };
    }

    const deletableIds = reclaimed
      .filter((menu) => menu._count.orderItems === 0)
      .map((menu) => menu.id);

    const { count: optionGroupsDeleted } =
      await this.prismaService.menuOptionGroup.deleteMany({
        where: { menuId: { in: reclaimed.map((menu) => menu.id) } },
      });
    const { count: menusDeleted } = await this.prismaService.menu.deleteMany({
      where: { id: { in: deletableIds } },
    });

    return {
      optionGroupsDeleted,
      menusDeleted,
      tombstones: reclaimed.length - deletableIds.length,
    };
  }
}
