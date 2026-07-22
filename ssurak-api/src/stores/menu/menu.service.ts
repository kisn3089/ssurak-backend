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

    // 이미지를 먼저 정식 경로로 승격한 뒤 DB에 쓴다. 이 순서라면 create가 실패했을 때
    // 방금 승격한 menu/ 객체가 orphan으로 남지만, 깨진 참조보다는 낫다고 보고 감수한다.
    // (참조됐을 수 있는 객체를 지우지 않는 정책과 같은 선상 — StorageService엔 삭제가 없다.)
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

    // create와 동일하게 승격 후 update 실패 시 새 menu/ 객체는 orphan으로 감수한다.
    // 구 imageKey는 DB에 그대로 남으므로 참조 무결성은 깨지지 않는다.
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
