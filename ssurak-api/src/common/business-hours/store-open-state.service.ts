import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Tx } from "src/utils/helper/transactionPipe";
import { getBusinessDate, shiftBusinessDate } from "./business-day";
import {
  NEXT_OPEN_SEARCH_DAYS,
  resolveStoreOpenState,
  StoreOpenState,
} from "./store-open-state";

const STORE_SCHEDULE_SELECT = {
  id: true,
  isPaused: true,
  timezone: true,
  businessDayCutoff: true,
  orderNumberPrefix: true,
} as const;

export type StoreSchedule = {
  id: bigint;
  isPaused: boolean;
  timezone: string;
  businessDayCutoff: number;
  orderNumberPrefix: string;
};

export type StoreOpenStateResult = {
  store: StoreSchedule;
  state: StoreOpenState;
};

@Injectable()
export class StoreOpenStateService {
  constructor(private readonly prismaService: PrismaService) {}

  async loadSchedule(storeId: bigint, tx?: Tx): Promise<StoreSchedule> {
    const client = tx ?? this.prismaService;

    return await client.store.findUniqueOrThrow({
      where: { id: storeId },
      select: STORE_SCHEDULE_SELECT,
    });
  }

  /**
   * 매장의 현재 영업 상태를 판정한다.
   *
   * `tx`를 받는 이유: 주문 생성 트랜잭션 안에서 같은 커넥션으로 읽어야
   * 판정과 채번 사이에 영업시간이 바뀌는 창을 줄일 수 있다.
   */
  async resolveById(
    storeId: bigint,
    now: Date = new Date(),
    tx?: Tx
  ): Promise<StoreOpenStateResult> {
    return await this.storeOpenState(
      await this.loadSchedule(storeId, tx),
      now,
      tx
    );
  }

  /** publicId로 조회하는 점주 콘솔용 진입점. */
  async resolveByPublicId(
    storePublicId: string,
    ownerId: bigint,
    now: Date = new Date()
  ): Promise<StoreOpenStateResult> {
    const store = await this.prismaService.store.findFirstOrThrow({
      where: { publicId: storePublicId, ownerId },
      select: STORE_SCHEDULE_SELECT,
    });

    return await this.storeOpenState(store, now);
  }

  /**
   * 매장 설정을 이미 들고 있을 때 쓰는 진입점.
   * 휴무일은 판정 대상 영업일과 nextOpenAt 탐색 범위만 읽는다 — 전 기간을 읽을 이유가 없다.
   */
  async storeOpenState(
    store: StoreSchedule,
    now: Date = new Date(),
    tx?: Tx
  ): Promise<StoreOpenStateResult> {
    const client = tx ?? this.prismaService;
    const businessDate = getBusinessDate(now, store);

    const [businessHours, closures] = await Promise.all([
      client.storeBusinessHour.findMany({
        where: { storeId: store.id },
        orderBy: { dayOfWeek: "asc" },
      }),
      client.storeClosure.findMany({
        where: {
          storeId: store.id,
          date: {
            gte: businessDate,
            lte: shiftBusinessDate(businessDate, NEXT_OPEN_SEARCH_DAYS),
          },
        },
      }),
    ]);

    return {
      store,
      state: resolveStoreOpenState({ store, businessHours, closures, now }),
    };
  }
}
