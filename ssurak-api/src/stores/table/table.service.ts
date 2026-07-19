import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { type PublicTable } from "@ssurak/db";
import {
  CreateTablePayloadDto,
  UpdateTablePayloadDto,
} from "src/dto/request/table.dto";
import { TableListQuery } from "@ssurak/schema";

type StoreIdAndTableIdParams = {
  storeId: string;
  tableId: string;
};
@Injectable()
export class TableService {
  constructor(private readonly prismaService: PrismaService) {}
  private readonly omitPrivate = { id: true, storeId: true } as const;

  async createTable(
    storeId: string,
    createTablePayload: CreateTablePayloadDto
  ): Promise<PublicTable> {
    const createdTable = await this.prismaService.table.create({
      data: {
        ...createTablePayload,
        store: { connect: { publicId: storeId } },
      },
      omit: this.omitPrivate,
    });
    return createdTable;
  }

  async getTableList(
    storeId: string,
    query?: TableListQuery
  ): Promise<PublicTable[]> {
    return await this.prismaService.table.findMany({
      where: {
        store: { publicId: storeId },
        ...(query?.isActive !== undefined ? { isActive: query.isActive } : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      omit: this.omitPrivate,
    });
  }

  async getTableUnique({
    storeId,
    tableId,
  }: StoreIdAndTableIdParams): Promise<PublicTable> {
    return await this.prismaService.table.findFirstOrThrow({
      where: { publicId: tableId, store: { publicId: storeId } },
      omit: this.omitPrivate,
    });
  }

  async partialUpdateTable(
    { storeId, tableId }: StoreIdAndTableIdParams,
    updateTablePayload: UpdateTablePayloadDto
  ): Promise<PublicTable> {
    return await this.prismaService.table.update({
      where: { publicId: tableId, store: { publicId: storeId } },
      data: updateTablePayload,
      omit: this.omitPrivate,
    });
  }

  async deleteTable({
    storeId,
    tableId,
  }: StoreIdAndTableIdParams): Promise<PublicTable> {
    return await this.prismaService.table.delete({
      where: { publicId: tableId, store: { publicId: storeId } },
      omit: this.omitPrivate,
    });
  }
}
