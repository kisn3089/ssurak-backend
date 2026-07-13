import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Prisma, TokenPayload, User } from "@ssurak/db";

@Injectable()
export class StoresService {
  constructor(private readonly prismaService: PrismaService) {}
  omitPrivate = { id: true, ownerId: true } as const;

  async getStoreList<T extends Prisma.StoreFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreFindManyArgs>
  ): Promise<Prisma.StoreGetPayload<T>[]> {
    return await this.prismaService.store.findMany(args);
  }

  async getStoreUnique<T extends Prisma.StoreFindFirstOrThrowArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreFindFirstOrThrowArgs>
  ): Promise<Prisma.StoreGetPayload<T>> {
    return await this.prismaService.store.findFirstOrThrow(args);
  }

  addOwnerIdIfNotAdmin(
    user: User,
    role: TokenPayload["role"]
  ): Prisma.StoreWhereInput {
    if (role === "admin") {
      return {};
    }

    return { ownerId: user.id };
  }
}
