import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Prisma, PublicMenu } from "@ssurak/db";
import {
  CreateMenuPayloadDto,
  UpdateMenuPayloadDto,
} from "src/dto/request/menu.dto";
import { OMIT_MENU_PRIVATE } from "src/common/query/session-query.const";

@Injectable()
export class MenuService {
  constructor(private readonly prismaService: PrismaService) {}

  async createMenu(
    storeId: string,
    createPayload: CreateMenuPayloadDto
  ): Promise<PublicMenu> {
    const { categoryId, ...rest } = createPayload;
    await this.assertCategoryBelongsToStore(categoryId, storeId);

    return await this.prismaService.menu.create({
      data: { ...rest, category: { connect: { publicId: categoryId } } },
      omit: OMIT_MENU_PRIVATE,
    });
  }

  async getMenuList<T extends Prisma.MenuFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.MenuFindManyArgs>
  ): Promise<Prisma.MenuGetPayload<T>[]> {
    return await this.prismaService.menu.findMany(args);
  }

  async getMenuUnique<T extends Prisma.MenuFindFirstOrThrowArgs>(
    args: Prisma.SelectSubset<T, Prisma.MenuFindFirstOrThrowArgs>
  ): Promise<Prisma.MenuGetPayload<T>> {
    return await this.prismaService.menu.findFirstOrThrow(args);
  }

  async partialUpdateMenu(
    storeId: string,
    menuId: string,
    updatePayload: UpdateMenuPayloadDto
  ): Promise<PublicMenu> {
    const { categoryId, ...rest } = updatePayload;
    if (categoryId) {
      await this.assertCategoryBelongsToStore(categoryId, storeId);
    }

    return await this.prismaService.menu.update({
      where: this.whereMenuInStore(menuId, storeId),
      data: {
        ...rest,
        ...(categoryId && { category: { connect: { publicId: categoryId } } }),
      },
      omit: OMIT_MENU_PRIVATE,
    });
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
