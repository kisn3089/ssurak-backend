import { Injectable } from "@nestjs/common";
import { encrypt } from "src/utils/lib/crypt";
import { PrismaService } from "src/prisma/prisma.service";
import { Prisma } from "@ssurak/db";
import {
  CreateAdminPayloadDto,
  UpdateAdminPayloadDto,
} from "src/dto/request/admin.dto";

@Injectable()
export class AdminService {
  constructor(private readonly prismaService: PrismaService) {}
  omitPrivate = { id: true, password: true, refreshToken: true } as const;

  async createAdmin(createAdminPayload: CreateAdminPayloadDto) {
    const hashedPassword = await encrypt(createAdminPayload.password);
    const createdAdmin = await this.prismaService.admin.create({
      data: { ...createAdminPayload, password: hashedPassword },
      omit: this.omitPrivate,
    });
    return createdAdmin;
  }

  async getList<T extends Prisma.AdminFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.AdminFindManyArgs>
  ): Promise<Prisma.AdminGetPayload<T>[]> {
    return await this.prismaService.admin.findMany(args);
  }

  async getUnique<T extends Prisma.AdminFindFirstOrThrowArgs>(
    args: Prisma.SelectSubset<T, Prisma.AdminFindFirstOrThrowArgs>
  ): Promise<Prisma.AdminGetPayload<T>> {
    return await this.prismaService.admin.findFirstOrThrow(args);
  }

  async partialUpdateAdmin(
    publicId: string,
    updateAdminPayload: UpdateAdminPayloadDto
  ) {
    return await this.prismaService.admin.update({
      where: { publicId },
      data: updateAdminPayload,
      omit: this.omitPrivate,
    });
  }

  async updateRefreshToken(publicId: string, refreshToken: string) {
    return await this.prismaService.admin.update({
      where: { publicId },
      data: { refreshToken },
      omit: this.omitPrivate,
    });
  }

  async deleteAdmin(publicId: string) {
    return await this.prismaService.admin.delete({
      where: { publicId },
    });
  }

  async updateLastSignIn(publicId: string) {
    return await this.prismaService.admin.update({
      where: { publicId },
      data: { lastLoginAt: new Date() },
      omit: this.omitPrivate,
    });
  }
}
