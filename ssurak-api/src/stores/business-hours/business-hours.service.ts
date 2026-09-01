import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import {
  Owner,
  Prisma,
  PublicStoreBusinessHour,
  PublicStoreClosure,
} from "@ssurak/db";
import { MINUTES_PER_DAY } from "@ssurak/schema";
import {
  getBusinessDate,
  shiftBusinessDate,
  StoreOpenState,
  StoreOpenStateService,
} from "src/common/business-hours";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import {
  CreateClosurePayloadDto,
  ReplaceBusinessHoursPayloadDto,
  UpdateClosurePayloadDto,
} from "src/dto/request/businessHour.dto";
import { PrismaService } from "src/prisma/prisma.service";
import { Tx } from "src/utils/helper/transactionPipe";

/** 휴무일 목록의 기본 조회 구간. 점주 콘솔 캘린더가 한 분기를 보여준다. */
const DEFAULT_CLOSURE_RANGE_DAYS = 90;

export type ClosureRange = { from?: string; to?: string };

@Injectable()
export class BusinessHoursService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly storeOpenState: StoreOpenStateService
  ) {}

  private readonly OMIT_BUSINESS_HOUR_PRIVATE = {
    id: true,
    storeId: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  private readonly OMIT_CLOSURE_PRIVATE = {
    id: true,
    storeId: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  async getBusinessHours(
    client: Owner,
    storeId: string
  ): Promise<PublicStoreBusinessHour[]> {
    const store = await this.assertStoreBelongsToOwner(client, storeId);

    return await this.prismaService.storeBusinessHour.findMany({
      where: { storeId: store.id },
      orderBy: { dayOfWeek: "asc" },
      omit: this.OMIT_BUSINESS_HOUR_PRIVATE,
    });
  }

  /**
   * 요일 행 전체를 교체한다. 보내지 않은 요일은 삭제되고, 빈 배열이면
   * "영업시간 미설정"(= 항상 영업) 상태로 돌아간다.
   */
  async replaceBusinessHours(
    client: Owner,
    storeId: string,
    { days }: ReplaceBusinessHoursPayloadDto
  ): Promise<PublicStoreBusinessHour[]> {
    const store = await this.assertStoreBelongsToOwner(client, storeId);

    for (const day of days) {
      this.assertWithinBusinessDay(store.businessDayCutoff, day);
    }

    return await this.prismaService.$transaction(async (tx) => {
      await tx.storeBusinessHour.deleteMany({ where: { storeId: store.id } });

      if (days.length > 0) {
        await tx.storeBusinessHour.createMany({
          data: days.map((day) => ({
            storeId: store.id,
            dayOfWeek: day.dayOfWeek,
            isClosed: day.isClosed,
            openMinute: day.openMinute,
            closeMinute: day.closeMinute,
            breakStartMinute: day.breakStartMinute ?? null,
            breakEndMinute: day.breakEndMinute ?? null,
          })),
        });
      }

      return await tx.storeBusinessHour.findMany({
        where: { storeId: store.id },
        orderBy: { dayOfWeek: "asc" },
        omit: this.OMIT_BUSINESS_HOUR_PRIVATE,
      });
    });
  }

  async getClosures(
    client: Owner,
    storeId: string,
    range: ClosureRange
  ): Promise<PublicStoreClosure[]> {
    const store = await this.assertStoreBelongsToOwner(client, storeId);
    const today = getBusinessDate(new Date(), store);

    const from = range.from ?? today;
    const to = range.to ?? shiftBusinessDate(from, DEFAULT_CLOSURE_RANGE_DAYS);

    return await this.prismaService.storeClosure.findMany({
      where: { storeId: store.id, date: { gte: from, lte: to } },
      orderBy: { date: "asc" },
      omit: this.OMIT_CLOSURE_PRIVATE,
    });
  }

  async createClosure(
    client: Owner,
    storeId: string,
    createPayload: CreateClosurePayloadDto
  ): Promise<PublicStoreClosure> {
    const store = await this.assertStoreBelongsToOwner(client, storeId);

    this.assertSpecialHoursWithinBusinessDay(
      store.businessDayCutoff,
      createPayload.openMinute ?? null,
      createPayload.closeMinute ?? null
    );

    try {
      return await this.prismaService.storeClosure.create({
        data: {
          storeId: store.id,
          date: createPayload.date,
          reason: createPayload.reason ?? null,
          openMinute: createPayload.openMinute ?? null,
          closeMinute: createPayload.closeMinute ?? null,
        },
        omit: this.OMIT_CLOSURE_PRIVATE,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new HttpException(
          {
            ...exceptionContentsIs("CLOSURE_ALREADY_EXISTS"),
            details: createPayload.date,
          },
          HttpStatus.CONFLICT
        );
      }
      throw error;
    }
  }

  /**
   * 날짜는 바꿀 수 없다 — 옮기려면 지우고 새로 만든다.
   * openMinute·closeMinute을 함께 null로 보내면 다시 종일 휴무가 된다.
   */
  async partialUpdateClosure(
    client: Owner,
    storeId: string,
    closureId: string,
    updatePayload: UpdateClosurePayloadDto
  ): Promise<PublicStoreClosure> {
    const store = await this.assertStoreBelongsToOwner(client, storeId);

    const current = await this.prismaService.storeClosure.findFirstOrThrow({
      where: { publicId: closureId, storeId: store.id },
    });

    const openMinute =
      updatePayload.openMinute === undefined
        ? current.openMinute
        : updatePayload.openMinute;
    const closeMinute =
      updatePayload.closeMinute === undefined
        ? current.closeMinute
        : updatePayload.closeMinute;

    if ((openMinute === null) !== (closeMinute === null)) {
      throw new HttpException(
        {
          ...exceptionContentsIs("BADREQUEST"),
          details:
            "특별 영업시간은 오픈과 마감을 함께 지정해야 합니다. 종일 휴무는 둘 다 비워 주세요.",
        },
        HttpStatus.BAD_REQUEST
      );
    }

    if (
      openMinute !== null &&
      closeMinute !== null &&
      openMinute >= closeMinute
    ) {
      throw new HttpException(
        {
          ...exceptionContentsIs("BADREQUEST"),
          details: "마감 시각은 오픈 시각보다 뒤여야 합니다.",
        },
        HttpStatus.BAD_REQUEST
      );
    }

    this.assertSpecialHoursWithinBusinessDay(
      store.businessDayCutoff,
      openMinute,
      closeMinute
    );

    return await this.prismaService.storeClosure.update({
      where: { id: current.id },
      data: {
        reason:
          updatePayload.reason === undefined ? undefined : updatePayload.reason,
        openMinute,
        closeMinute,
      },
      omit: this.OMIT_CLOSURE_PRIVATE,
    });
  }

  async deleteClosure(
    client: Owner,
    storeId: string,
    closureId: string
  ): Promise<void> {
    const store = await this.assertStoreBelongsToOwner(client, storeId);

    const closure = await this.prismaService.storeClosure.findFirstOrThrow({
      where: { publicId: closureId, storeId: store.id },
      select: { id: true },
    });

    await this.prismaService.storeClosure.delete({ where: { id: closure.id } });
  }

  async getOpenState(client: Owner, storeId: string): Promise<StoreOpenState> {
    const { state } = await this.storeOpenState.resolveByPublicId(
      storeId,
      client.id
    );

    return state;
  }

  /**
   * 영업 구간이 영업일 경계 안에 들어오는지 확인한다.
   * cutoff는 매장 설정이라 zod가 body만으로는 검증할 수 없어 여기서 본다.
   */
  private assertWithinBusinessDay(
    cutoff: number,
    day: { isClosed: boolean; openMinute: number; closeMinute: number }
  ): void {
    if (day.isClosed) return;

    if (day.openMinute < cutoff || day.closeMinute > cutoff + MINUTES_PER_DAY) {
      throw new HttpException(
        {
          ...exceptionContentsIs("BUSINESS_HOURS_OUT_OF_RANGE"),
          details: { cutoff, dayOfWeek: day },
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private assertSpecialHoursWithinBusinessDay(
    cutoff: number,
    openMinute: number | null,
    closeMinute: number | null
  ): void {
    if (openMinute === null || closeMinute === null) return;

    this.assertWithinBusinessDay(cutoff, {
      isClosed: false,
      openMinute,
      closeMinute,
    });
  }

  /** 소유자의 매장인지 확인하고 판정에 필요한 설정을 함께 돌려준다. 아니면 P2025 -> 404. */
  private async assertStoreBelongsToOwner(
    client: Owner,
    storeId: string,
    tx: Tx = this.prismaService
  ): Promise<{
    id: bigint;
    timezone: string;
    businessDayCutoff: number;
  }> {
    return await tx.store.findFirstOrThrow({
      where: { publicId: storeId, owner: { id: client.id } },
      select: { id: true, timezone: true, businessDayCutoff: true },
    });
  }
}
