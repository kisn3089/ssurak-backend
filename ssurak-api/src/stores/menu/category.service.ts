import { Injectable } from "@nestjs/common";
import { Owner, PublicCategoryWithMenus } from "@ssurak/db";
import { CATEGORIES } from "src/common/query/session-query.const";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class CategoryService {
  constructor(private readonly prismaService: PrismaService) {}
  private readonly OMIT_CATEGORY_PRIVATE = { id: true, storeId: true } as const;

  async getCategoryWithMenuList(
    client: Owner,
    storeId: string
  ): Promise<PublicCategoryWithMenus[]> {
    return await this.prismaService.category.findMany({
      where: {
        store: { publicId: storeId, owner: { id: client.id } },
      },
      ...CATEGORIES,
      omit: this.OMIT_CATEGORY_PRIVATE,
    });
  }
}
