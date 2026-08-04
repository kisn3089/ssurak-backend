import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Owner, PublicStore, User } from "@ssurak/db";
import {
  CreateStorePayloadDto,
  UpdateStorePayloadDto,
} from "src/dto/request/store.dto";

@Injectable()
export class StoresService {
  constructor(private readonly prismaService: PrismaService) {}
  private readonly omitPrivate = { id: true, ownerId: true } as const;

  async createStore(
    owner: Owner,
    createPayload: CreateStorePayloadDto
  ): Promise<PublicStore> {
    return await this.prismaService.store.create({
      data: {
        ...createPayload,
        owner: { connect: { id: owner.id } },
      },
      omit: this.omitPrivate,
    });
  }

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

  /** 소유자가 아니면 where가 어긋나 P2025 -> 404. */
  async partialUpdateStore(
    user: User,
    storeId: string,
    updatePayload: UpdateStorePayloadDto
  ): Promise<PublicStore> {
    return await this.prismaService.store.update({
      where: {
        publicId: storeId,
        ownerId: user.id,
      },
      data: updatePayload,
      omit: this.omitPrivate,
    });
  }
}
