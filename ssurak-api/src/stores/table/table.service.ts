import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { type Prisma, type PublicTable } from "@ssurak/db";
import {
  CreateTablePayloadDto,
  UpdateTablePayloadDto,
} from "src/dto/request/table.dto";

type StoreIdAndTableIdParams = {
  storeId: string;
  tableId: string;
};
@Injectable()
export class TableService {
  constructor(private readonly prismaService: PrismaService) {}
  omitPrivate = { id: true, storeId: true } as const;

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

  async getTableList<T extends Prisma.TableFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.TableFindManyArgs>
  ): Promise<Prisma.TableGetPayload<T>[]> {
    return await this.prismaService.table.findMany(args);
  }

  async getTableUnique<T extends Prisma.TableFindFirstOrThrowArgs>(
    args: Prisma.SelectSubset<T, Prisma.TableFindFirstOrThrowArgs>
  ): Promise<Prisma.TableGetPayload<T>> {
    return await this.prismaService.table.findFirstOrThrow(args);
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
