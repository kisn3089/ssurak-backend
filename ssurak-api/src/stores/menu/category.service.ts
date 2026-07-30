import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import {
  Owner,
  Prisma,
  PublicCategory,
  PublicCategoryWithMenus,
} from "@ssurak/db";
import {
  CATEGORIES,
  CATEGORY_ORDER_BY,
} from "src/common/query/session-query.const";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import {
  CreateCategoryPayloadDto,
  ReorderCategoriesPayloadDto,
  UpdateCategoryPayloadDto,
} from "src/dto/request/category.dto";
import { PrismaService } from "src/prisma/prisma.service";
import {
  assertSameSet,
  renumberSortOrder,
  SORT_ORDER_STEP,
} from "src/utils/helper/reorder";
import {
  REORDER_TX_TIMEOUT_MS,
  withReorderLock,
} from "src/utils/helper/withReorderLock";
import { Tx } from "src/utils/helper/transactionPipe";

@Injectable()
export class CategoryService {
  constructor(private readonly prismaService: PrismaService) {}
  private readonly OMIT_CATEGORY_PRIVATE = { storeId: true } as const;
  private readonly OMIT_CATEGORY_PUBLIC = {
    ...this.OMIT_CATEGORY_PRIVATE,
    id: true,
  } as const;

  async createCategory(
    client: Owner,
    storeId: string,
    createPayload: CreateCategoryPayloadDto
  ): Promise<PublicCategory> {
    const store = await this.assertStoreBelongsToOwner(client, storeId);

    return await this.prismaService.category.create({
      data: {
        name: createPayload.name,
        sortOrder: await this.nextSortOrder(client, storeId),
        store: { connect: { id: store.id } },
      },
      omit: this.OMIT_CATEGORY_PUBLIC,
    });
  }

  async getCategoryWithMenuList(
    client: Owner,
    storeId: string
  ): Promise<PublicCategoryWithMenus[]> {
    return await this.prismaService.category.findMany({
      where: this.whereInStore(client, storeId),
      ...CATEGORIES,
      omit: this.OMIT_CATEGORY_PRIVATE,
    });
  }

  async getCategoryList(
    client: Owner,
    storeId: string
  ): Promise<PublicCategory[]> {
    return await this.prismaService.category.findMany({
      where: this.whereInStore(client, storeId),
      orderBy: CATEGORY_ORDER_BY,
      omit: this.OMIT_CATEGORY_PUBLIC,
    });
  }

  async getCategoryUnique(
    client: Owner,
    storeId: string,
    categoryId: string
  ): Promise<PublicCategory> {
    return await this.prismaService.category.findFirstOrThrow({
      where: { publicId: categoryId, ...this.whereInStore(client, storeId) },
      omit: this.OMIT_CATEGORY_PUBLIC,
    });
  }

  async partialUpdateCategory(
    client: Owner,
    storeId: string,
    categoryId: string,
    updatePayload: UpdateCategoryPayloadDto
  ): Promise<PublicCategory> {
    return await this.prismaService.category.update({
      where: { publicId: categoryId, ...this.whereInStore(client, storeId) },
      data: updatePayload,
      omit: this.OMIT_CATEGORY_PUBLIC,
    });
  }

  async reorderCategories(
    client: Owner,
    storeId: string,
    { categoryIds }: ReorderCategoriesPayloadDto
  ): Promise<PublicCategory[]> {
    return await this.prismaService.$transaction(
      (tx) =>
        withReorderLock(tx, storeId, async () => {
          const current = await tx.category.findMany({
            where: this.whereInStore(client, storeId),
            select: { publicId: true },
          });

          assertSameSet(
            current.map(({ publicId }) => publicId),
            categoryIds,
            "CATEGORY_ORDER_MISMATCH"
          );

          await renumberSortOrder(tx, "category", categoryIds);

          return await tx.category.findMany({
            where: this.whereInStore(client, storeId),
            orderBy: CATEGORY_ORDER_BY,
            omit: this.OMIT_CATEGORY_PUBLIC,
          });
        }),
      { timeout: REORDER_TX_TIMEOUT_MS }
    );
  }

  async deleteCategory(
    client: Owner,
    storeId: string,
    categoryId: string
  ): Promise<void> {
    await this.prismaService.$transaction(async (tx) => {
      const category = await tx.category.findFirstOrThrow({
        where: { publicId: categoryId, ...this.whereInStore(client, storeId) },
        select: { id: true, _count: { select: { menus: true } } },
      });

      if (category._count.menus > 0) {
        throw new HttpException(
          exceptionContentsIs("CATEGORY_HAS_MENUS"),
          HttpStatus.CONFLICT
        );
      }

      await tx.category.delete({ where: { id: category.id } });
    });
  }

  /** 소유자의 매장인지 확인하고 내부 id를 돌려준다. 아니면 P2025 -> 404. */
  private async assertStoreBelongsToOwner(
    client: Owner,
    storeId: string,
    tx: Tx = this.prismaService
  ): Promise<{ id: bigint }> {
    return await tx.store.findFirstOrThrow({
      where: { publicId: storeId, owner: { id: client.id } },
      select: { id: true },
    });
  }

  /** 매장의 마지막 카테고리 뒤에 붙일 표시 순서. */
  private async nextSortOrder(
    client: Owner,
    storeId: string,
    tx: Tx = this.prismaService
  ): Promise<number> {
    const last = await tx.category.findFirst({
      where: this.whereInStore(client, storeId),
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    return (last?.sortOrder ?? 0) + SORT_ORDER_STEP;
  }

  private whereInStore(client: Owner, storeId: string) {
    return {
      store: { publicId: storeId, owner: { id: client.id } },
    } satisfies Prisma.CategoryWhereInput;
  }
}
