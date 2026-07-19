import {
  Body,
  Controller,
  Param,
  Post,
  Get,
  Patch,
  Delete,
  UseGuards,
  Query,
  HttpCode,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { TableService } from "./table.service";
import {
  DocsTableCreate,
  DocsTableDelete,
  DocsTableGetList,
  DocsTableGetUnique,
  DocsTableUpdate,
} from "src/docs/table.docs";
import {
  createTablePayloadSchema,
  storeIdAndTableIdParamsSchema,
  storeIdParamsSchema,
  type TableListQuery,
  tableListQuerySchema,
  updateTablePayloadSchema,
} from "@ssurak/schema";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import type { PublicTable } from "@ssurak/db";
import {
  CreateTablePayloadDto,
  UpdateTablePayloadDto,
} from "src/dto/request/table.dto";
import { StoreAccessGuard } from "src/utils/guards/store-access.guard";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";

@ApiTags("Table")
@ApiBearerAuth()
@Controller(":storeId/tables")
@UseGuards(JwtAuthGuard, StoreAccessGuard)
export class TableController {
  constructor(private readonly tableService: TableService) {}

  @Post()
  @UseGuards(
    ZodValidation({
      params: storeIdParamsSchema,
      body: createTablePayloadSchema,
    })
  )
  @DocsTableCreate()
  async create(
    @Param("storeId") storeId: string,
    @Body() createTablePayload: CreateTablePayloadDto
  ): Promise<PublicTable> {
    return await this.tableService.createTable(storeId, createTablePayload);
  }

  @Get()
  @UseGuards(
    ZodValidation({ params: storeIdParamsSchema, query: tableListQuerySchema })
  )
  @DocsTableGetList()
  async list(
    @Param("storeId") storeId: string,
    @Query() query?: TableListQuery
  ): Promise<PublicTable[]> {
    return await this.tableService.getTableList(storeId, query);
  }

  @Get(":tableId")
  @UseGuards(ZodValidation({ params: storeIdAndTableIdParamsSchema }))
  @DocsTableGetUnique()
  async unique(
    @Param("storeId") storeId: string,
    @Param("tableId") tableId: string
  ): Promise<PublicTable> {
    return await this.tableService.getTableUnique({ storeId, tableId });
  }

  @Patch(":tableId")
  @UseGuards(
    ZodValidation({
      params: storeIdAndTableIdParamsSchema,
      body: updateTablePayloadSchema,
    })
  )
  @DocsTableUpdate()
  async partialUpdate(
    @Param("storeId") storeId: string,
    @Param("tableId") tableId: string,
    @Body() updateTablePayload: UpdateTablePayloadDto
  ): Promise<PublicTable> {
    return await this.tableService.partialUpdateTable(
      { storeId, tableId },
      updateTablePayload
    );
  }

  @Delete(":tableId")
  @HttpCode(204)
  @UseGuards(ZodValidation({ params: storeIdAndTableIdParamsSchema }))
  @DocsTableDelete()
  async delete(
    @Param("storeId") storeId: string,
    @Param("tableId") tableId: string
  ): Promise<void> {
    await this.tableService.deleteTable({ storeId, tableId });
  }
}
