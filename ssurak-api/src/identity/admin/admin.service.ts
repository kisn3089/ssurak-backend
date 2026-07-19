import { Injectable } from "@nestjs/common";
import { encrypt } from "src/utils/lib/crypt";
import { PrismaService } from "src/prisma/prisma.service";
import { PublicAdmin } from "@ssurak/db";
import {
  CreateAdminPayloadDto,
  UpdateAdminPayloadDto,
} from "src/dto/request/admin.dto";

@Injectable()
export class AdminService {
  constructor(private readonly prismaService: PrismaService) {}
  private readonly omitPrivate = { id: true, password: true } as const;

  async createAdmin(createAdminPayload: CreateAdminPayloadDto) {
    const hashedPassword = await encrypt(createAdminPayload.password);
    const createdAdmin = await this.prismaService.admin.create({
      data: { ...createAdminPayload, password: hashedPassword },
      omit: this.omitPrivate,
    });
    return createdAdmin;
  }

  async getAdminList(id: bigint): Promise<PublicAdmin[]> {
    return await this.prismaService.admin.findMany({
      where: { id },
      omit: this.omitPrivate,
    });
  }

  async getAdminUniqueById(adminId: string): Promise<PublicAdmin> {
    return await this.prismaService.admin.findFirstOrThrow({
      where: { publicId: adminId },
      omit: this.omitPrivate,
    });
  }

  async getAdminUniqueAllInclude(id?: string, email?: string) {
    return await this.prismaService.admin.findFirstOrThrow({
      where: { publicId: id, email },
    });
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
