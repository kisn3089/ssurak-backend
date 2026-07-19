import { Injectable } from "@nestjs/common";
import { encrypt } from "src/utils/lib/crypt";
import { Owner, PublicOwner } from "@ssurak/db";
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

  async getOwnerList(ownerId: bigint): Promise<PublicOwner[]> {
    return await this.prismaService.owner.findMany({
      where: { id: ownerId },
      omit: this.omitPrivate,
    });
  }

  async getOwnerUniqueById(ownerId: string): Promise<PublicOwner> {
    return await this.prismaService.owner.findFirstOrThrow({
      where: { publicId: ownerId },
      omit: this.omitPrivate,
    });
  }

  async getOwnerUniqueAllInclude(id?: string, email?: string): Promise<Owner> {
    return await this.prismaService.owner.findFirstOrThrow({
      where: { publicId: id, email },
    });
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
