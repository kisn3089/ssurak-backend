import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Prisma, PublicMenu } from "@ssurak/db";
import {
  CreateMenuPayloadDto,
  UpdateMenuPayloadDto,
} from "src/dto/request/menu.dto";
import { OMIT_MENU_PRIVATE } from "src/common/query/session-query.const";
import { StorageService } from "src/storage/storage.service";

const SORT_ORDER_STEP = 10;

@Injectable()
export class MenuService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly storageService: StorageService
  ) {}

  async createMenu(
    storeId: string,
    ownerPublicId: string,
    createPayload: CreateMenuPayloadDto
  ): Promise<PublicMenu> {
    const { categoryId, imageKey, requiredOptions, customOptions, ...rest } =
      createPayload;
    await this.assertCategoryBelongsToStore(categoryId, storeId);

    const promotedKey = imageKey
      ? await this.storageService.promoteMenuImage(imageKey, ownerPublicId)
      : null;

    return await this.prismaService.menu.create({
      data: {
        ...rest,
        imageKey: promotedKey,
        requiredOptions: this.jsonInput(requiredOptions),
        customOptions: this.jsonInput(customOptions),
        category: { connect: { publicId: categoryId } },
      },
      omit: OMIT_MENU_PRIVATE,
    });
  }

  /** nullable Json payload를 Prisma 입력으로 정규화한다. */
  private jsonInput<T>(value: T | null | undefined) {
    return value === null ? Prisma.DbNull : value;
  }

  async getMenuUnique(storeId: string, menuId: string): Promise<PublicMenu> {
    return await this.prismaService.menu.findFirstOrThrow({
      where: {
        publicId: menuId,
        category: { store: { publicId: storeId } },
      },
      omit: OMIT_MENU_PRIVATE,
    });
  }

  async partialUpdateMenu(
    storeId: string,
    menuId: string,
    ownerPublicId: string,
    updatePayload: UpdateMenuPayloadDto
  ): Promise<PublicMenu> {
    const {
      categoryId,
      imageKey,
      sortOrder,
      requiredOptions,
      customOptions,
      ...rest
    } = updatePayload;

    const imageUpdate = await this.resolveImageUpdate(imageKey, ownerPublicId);

    return await this.prismaService.$transaction(async (tx) => {
      if (categoryId) {
        await this.assertCategoryBelongsToStore(categoryId, storeId, tx);
      }

      if (sortOrder !== undefined) {
        await this.rebalanceSortOrder(
          tx,
          storeId,
          menuId,
          categoryId,
          sortOrder
        );
      }

      return await tx.menu.update({
        where: this.whereMenuInStore(menuId, storeId),
        data: {
          ...rest,
          ...imageUpdate,
          ...(sortOrder !== undefined && { sortOrder }),
          requiredOptions: this.jsonInput(requiredOptions),
          customOptions: this.jsonInput(customOptions),
          ...(categoryId && {
            category: { connect: { publicId: categoryId } },
          }),
        },
        omit: OMIT_MENU_PRIVATE,
      });
    });
  }

  /** 수정 요청의 `imageKey`를 Prisma data 조각으로 바꾼다. */
  private async resolveImageUpdate(
    imageKey: string | null | undefined,
    ownerPublicId: string
  ): Promise<{ imageKey?: string | null }> {
    if (imageKey === undefined) return {};
    if (imageKey === null) return { imageKey: null };

    return {
      imageKey: await this.storageService.promoteMenuImage(
        imageKey,
        ownerPublicId
      ),
    };
  }

  private async assertCategoryBelongsToStore(
    categoryPublicId: string,
    storePublicId: string,
    tx?: Prisma.TransactionClient
  ): Promise<string> {
    const category = await (tx ?? this.prismaService).category.findFirstOrThrow(
      {
        where: {
          publicId: categoryPublicId,
          store: { publicId: storePublicId },
        },
        select: { publicId: true },
      }
    );

    return category.publicId;
  }

  private async rebalanceSortOrder(
    tx: Prisma.TransactionClient,
    storeId: string,
    menuId: string,
    categoryId: string | undefined,
    sortOrder: number
  ): Promise<void> {
    const categoryPublicId =
      categoryId ??
      (
        await tx.menu.findFirstOrThrow({
          where: {
            publicId: menuId,
            category: { store: { publicId: storeId } },
          },
          select: { category: { select: { publicId: true } } },
        })
      ).category.publicId;

    const scope = {
      category: { publicId: categoryPublicId },
      deletedAt: null,
      publicId: { not: menuId },
    } satisfies Prisma.MenuWhereInput;

    const duplicate = await tx.menu.findFirst({
      where: { ...scope, sortOrder },
      select: { publicId: true },
    });
    if (!duplicate) return;

    const next = await tx.menu.findFirst({
      where: { ...scope, sortOrder: { gt: sortOrder } },
      orderBy: { sortOrder: "asc" },
      select: { sortOrder: true },
    });

    const newOrder = next
      ? Math.floor((sortOrder + next.sortOrder) / 2)
      : sortOrder + SORT_ORDER_STEP;

    /** 정렬 순서가 겹친 경우 */
    if (next && newOrder === sortOrder) {
      await this.respaceSortOrdersFrom(tx, categoryPublicId, menuId, sortOrder);
      return;
    }

    await tx.menu.update({
      where: { publicId: duplicate.publicId },
      data: { sortOrder: newOrder },
    });
  }

  private async respaceSortOrdersFrom(
    tx: Prisma.TransactionClient,
    categoryPublicId: string,
    menuId: string,
    sortOrder: number
  ): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
        UPDATE \`menu\` AS m
        JOIN (
          SELECT menu.id AS id,
                 ROW_NUMBER() OVER (ORDER BY menu.sort_order ASC, menu.id ASC) AS rn
          FROM \`menu\`
          JOIN \`category\` ON category.id = menu.category_id
          WHERE category.public_id = ${categoryPublicId}
            AND menu.deleted_at IS NULL
            AND menu.public_id <> ${menuId}
            AND menu.sort_order >= ${sortOrder}
        ) AS ranked ON ranked.id = m.id
        SET m.sort_order = ${sortOrder} + ranked.rn * ${SORT_ORDER_STEP}
      `);
  }

  async softDeleteMenu(storeId: string, menuId: string): Promise<void> {
    await this.prismaService.menu.update({
      where: this.whereMenuInStore(menuId, storeId),
      data: { deletedAt: new Date() },
    });
  }

  private whereMenuInStore(
    menuId: string,
    storeId: string
  ): Prisma.MenuWhereUniqueInput {
    return {
      publicId: menuId,
      category: { store: { publicId: storeId } },
    };
  }
}
