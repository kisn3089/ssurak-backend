import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Owner, PublicStore, User } from "@ssurak/db";
import { MINUTES_PER_DAY } from "@ssurak/schema";
import {
  getBusinessDate,
  isSupportedTimezone,
} from "src/common/business-hours";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import {
  CreateStorePayloadDto,
  UpdateStorePayloadDto,
} from "src/dto/request/store.dto";

@Injectable()
export class StoresService {
  constructor(private readonly prismaService: PrismaService) {}
  private readonly omitPrivate = { id: true, ownerId: true } as const;

  async createStore(
    owner: Owner,
    createPayload: CreateStorePayloadDto
  ): Promise<PublicStore> {
    this.assertSupportedTimezone(createPayload.timezone);

    return await this.prismaService.store.create({
      data: {
        ...createPayload,
        owner: { connect: { id: owner.id } },
      },
      omit: this.omitPrivate,
    });
  }

  async getStoreList(user: User): Promise<PublicStore[]> {
    return await this.prismaService.store.findMany({
      where: { ownerId: user.id },
      omit: this.omitPrivate,
    });
  }

  async getStoreUnique(user: User, storeId: string): Promise<PublicStore> {
    return await this.prismaService.store.findFirstOrThrow({
      where: {
        publicId: storeId,
        ownerId: user.id,
      },
      omit: this.omitPrivate,
    });
  }

  /** 소유자가 아니면 where가 어긋나 P2025 -> 404. */
  async partialUpdateStore(
    user: User,
    storeId: string,
    updatePayload: UpdateStorePayloadDto
  ): Promise<PublicStore> {
    this.assertSupportedTimezone(updatePayload.timezone);

    if (updatePayload.businessDayCutoff !== undefined) {
      await this.assertCutoffFitsBusinessHours(
        user,
        storeId,
        updatePayload.businessDayCutoff,
        updatePayload.timezone
      );
    }

    return await this.prismaService.store.update({
      where: {
        publicId: storeId,
        ownerId: user.id,
      },
      data: updatePayload,
      omit: this.omitPrivate,
    });
  }

  /**
   * zod는 형식만 본다. 실재하지 않는 IANA 이름을 저장하면 영업 판정이
   * Intl에서 던져 주문마다 500이 나므로 여기서 막는다.
   */
  private assertSupportedTimezone(timezone?: string): void {
    if (timezone === undefined || isSupportedTimezone(timezone)) return;

    throw new HttpException(
      { ...exceptionContentsIs("INVALID_TIMEZONE"), details: timezone },
      HttpStatus.BAD_REQUEST
    );
  }

  /**
   * 영업일 경계를 옮기면 이미 저장된 영업시간이 경계 밖으로 새어 나갈 수 있다.
   * (예: 09:00 오픈인데 cutoff를 600(10:00)으로 올리면 그 요일은 영원히 닫힌다)
   *
   * 휴무일의 특별 영업시간도 같은 경계를 쓰고, 판정에서는 정기 영업시간보다
   * 우선하므로 함께 본다. 지난 날짜는 판정에 쓰이지 않아 오늘 영업일부터만 센다.
   */
  private async assertCutoffFitsBusinessHours(
    user: User,
    storeId: string,
    cutoff: number,
    timezone?: string
  ): Promise<void> {
    const store = await this.prismaService.store.findFirstOrThrow({
      where: { publicId: storeId, ownerId: user.id },
      select: { id: true, timezone: true },
    });

    const outOfRange = [
      { openMinute: { lt: cutoff } },
      { closeMinute: { gt: cutoff + MINUTES_PER_DAY } },
    ];

    const conflicting = await this.prismaService.storeBusinessHour.findFirst({
      where: { storeId: store.id, isClosed: false, OR: outOfRange },
      select: { dayOfWeek: true, openMinute: true, closeMinute: true },
    });

    if (conflicting) this.throwCutoffConflict(cutoff, conflicting);

    const businessDate = getBusinessDate(new Date(), {
      timezone: timezone ?? store.timezone,
      businessDayCutoff: cutoff,
    });

    const conflictingClosure = await this.prismaService.storeClosure.findFirst({
      where: {
        storeId: store.id,
        date: { gte: businessDate },
        openMinute: { not: null },
        closeMinute: { not: null },
        OR: outOfRange,
      },
      select: { date: true, openMinute: true, closeMinute: true },
    });

    if (conflictingClosure)
      this.throwCutoffConflict(cutoff, conflictingClosure);
  }

  private throwCutoffConflict(cutoff: number, conflicting: object): never {
    throw new HttpException(
      {
        ...exceptionContentsIs("BUSINESS_HOURS_OUT_OF_RANGE"),
        details: { cutoff, conflicting },
      },
      HttpStatus.BAD_REQUEST
    );
  }
}
