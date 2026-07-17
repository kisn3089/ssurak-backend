import { Injectable } from "@nestjs/common";
import { encrypt } from "src/utils/lib/crypt";
import { Prisma, PublicOwner } from "@ssurak/db";
import { PrismaService } from "src/prisma/prisma.service";
import {
  CreateOwnerPayloadDto,
  UpdateOwnerPayloadDto,
} from "src/dto/request/owner.dto";

@Injectable()
export class OwnerService {
  constructor(private readonly prismaService: PrismaService) {}
  omitPrivate = { id: true, password: true } as const;

  async createOwner(
    createOwnerPayload: CreateOwnerPayloadDto
  ): Promise<PublicOwner> {
    const encryptedPassword = await encrypt(createOwnerPayload.password);
    const createdOwner = await this.prismaService.owner.create({
      data: { ...createOwnerPayload, password: encryptedPassword },
      omit: this.omitPrivate,
    });

    return createdOwner;
  }

  async getList<T extends Prisma.OwnerFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.OwnerFindManyArgs>
  ): Promise<Prisma.OwnerGetPayload<T>[]> {
    return await this.prismaService.owner.findMany(args);
  }

  async getUnique<T extends Prisma.OwnerFindFirstOrThrowArgs>(
    args: Prisma.SelectSubset<T, Prisma.OwnerFindFirstOrThrowArgs>
  ): Promise<Prisma.OwnerGetPayload<T>> {
    return await this.prismaService.owner.findFirstOrThrow(args);
  }

  async partialUpdateOwner(
    publicId: string,
    updateOwnerPayload: UpdateOwnerPayloadDto
  ): Promise<PublicOwner> {
    return await this.prismaService.owner.update({
      where: { publicId: publicId },
      data: updateOwnerPayload,
      omit: this.omitPrivate,
    });
  }

  async updateLastSignIn(publicId: string): Promise<PublicOwner> {
    return await this.prismaService.owner.update({
      where: { publicId: publicId },
      data: { lastLoginAt: new Date() },
      omit: this.omitPrivate,
    });
  }

  async deleteOwner(publicId: string): Promise<PublicOwner> {
    return await this.prismaService.owner.delete({
      where: { publicId: publicId },
      omit: this.omitPrivate,
    });
  }
}
