import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Prisma, PublicMenu } from "@ssurak/db";
import {
  CreateMenuPayloadDto,
  UpdateMenuPayloadDto,
} from "src/dto/request/menu.dto";
import { OMIT_MENU_PRIVATE } from "src/common/query/session-query.const";
import { StorageService } from "src/storage/storage.service";

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
    const { categoryId, imageKey, ...rest } = createPayload;
    await this.assertCategoryBelongsToStore(categoryId, storeId);

    const promotedKey = imageKey
      ? await this.storageService.promoteMenuImage(imageKey, ownerPublicId)
      : null;

    return await this.prismaService.menu.create({
      data: {
        ...rest,
        imageKey: promotedKey,
        category: { connect: { publicId: categoryId } },
      },
      omit: OMIT_MENU_PRIVATE,
    });
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
    const { categoryId, imageKey, ...rest } = updatePayload;
    if (categoryId) {
      await this.assertCategoryBelongsToStore(categoryId, storeId);
    }

    const imageUpdate = await this.resolveImageUpdate(imageKey, ownerPublicId);

    return await this.prismaService.menu.update({
      where: this.whereMenuInStore(menuId, storeId),
      data: {
        ...rest,
        ...imageUpdate,
        ...(categoryId && { category: { connect: { publicId: categoryId } } }),
      },
      omit: OMIT_MENU_PRIVATE,
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

  private async assertCategoryBelongsToStore(
    categoryPublicId: string,
    storePublicId: string
  ): Promise<void> {
    await this.prismaService.category.findFirstOrThrow({
      where: { publicId: categoryPublicId, store: { publicId: storePublicId } },
      select: { id: true },
    });
  }
}
