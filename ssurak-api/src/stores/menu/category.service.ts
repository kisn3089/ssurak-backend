import { Injectable } from "@nestjs/common";
import { Prisma } from "@ssurak/db";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class CategoryService {
  constructor(private readonly prismaService: PrismaService) {}

  async getCategoryList<T extends Prisma.CategoryFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.CategoryFindManyArgs>
  ): Promise<Prisma.CategoryGetPayload<T>[]> {
    return await this.prismaService.category.findMany(args);
  }
}
