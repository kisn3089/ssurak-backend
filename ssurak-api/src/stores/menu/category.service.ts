import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import {
  Owner,
  Prisma,
  PublicCategory,
  PublicCategoryWithMenus,
} from "@ssurak/db";
import { CATEGORIES } from "src/common/query/session-query.const";
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
import { withStoreLock } from "src/utils/helper/withStoreLock";
import { Tx } from "src/utils/helper/transactionPipe";

@Injectable()
export class CategoryService {
  constructor(private readonly prismaService: PrismaService) {}
  private readonly OMIT_CATEGORY_PRIVATE = { storeId: true } as const;
  private readonly OMIT_CATEGORY_PUBLIC = {
    ...this.OMIT_CATEGORY_PRIVATE,
    id: true,
  } as const;

  private readonly ORDER_BY_SORT: Prisma.CategoryOrderByWithRelationInput[] = [
    { sortOrder: "asc" },
    { id: "asc" },
  ];

  /**
   * 카테고리는 항상 맨 뒤에 붙는다. 동시 생성으로 sortOrder가 겹쳐도 목록은
   * id 타이브레이크로 결정적이고, 다음 재정렬에서 전부 다시 매겨진다.
   */
  async createCategory(
    client: Owner,
    storeId: string,
    createPayload: CreateCategoryPayloadDto
  ): Promise<PublicCategory> {
    return await this.prismaService.category.create({
      data: {
        name: createPayload.name,
        sortOrder: await this.nextSortOrder(client, storeId),
        store: { connect: { publicId: storeId } },
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
      orderBy: this.ORDER_BY_SORT,
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
    return await this.prismaService.$transaction((tx) =>
      withStoreLock(tx, storeId, async () => {
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
          orderBy: this.ORDER_BY_SORT,
          omit: this.OMIT_CATEGORY_PUBLIC,
        });
      })
    );
  }

  /**
   * 카테고리를 하드 삭제한다. 메뉴의 `categoryId`는 필수라 옮길 곳이 없고,
   * 소프트 삭제된 메뉴도 FK를 계속 붙들고 있다. 한 건이라도 남아 있으면
   * FK 위반(400)으로 흘리지 않고 409로 먼저 막는다.
   */
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
