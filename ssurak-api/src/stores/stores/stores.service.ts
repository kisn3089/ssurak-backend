import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { PublicStore, User } from "@ssurak/db";

@Injectable()
export class StoresService {
  constructor(private readonly prismaService: PrismaService) {}
  private readonly omitPrivate = { id: true, ownerId: true } as const;

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
}
