import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CategoryService } from "./category.service";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import {
  createCategoryPayloadSchema,
  reorderCategoriesPayloadSchema,
  storeIdAndCategoryIdParamsSchema,
  storeIdParamsSchema,
  updateCategoryPayloadSchema,
} from "@ssurak/schema";
import { Client } from "src/decorators/client.decorator";
import type { Owner } from "@ssurak/db";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { StoreAccessGuard } from "src/utils/guards/store-access.guard";
import { PublicCategoryDto } from "src/dto/response/category.dto";
import {
  CreateCategoryPayloadDto,
  ReorderCategoriesPayloadDto,
  UpdateCategoryPayloadDto,
} from "src/dto/request/category.dto";
import {
  DocsCategoryCreate,
  DocsCategoryDelete,
  DocsCategoryGetList,
  DocsCategoryGetUnique,
  DocsCategoryReorder,
  DocsCategoryUpdate,
} from "src/docs/category.docs";

@ApiTags("Category")
@ApiBearerAuth()
@Controller(":storeId/categories")
@UseGuards(JwtAuthGuard, StoreAccessGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @UseGuards(
    ZodValidation({
      params: storeIdParamsSchema,
      body: createCategoryPayloadSchema,
    })
  )
  @DocsCategoryCreate()
  async create(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Body() createCategoryPayload: CreateCategoryPayloadDto
  ): Promise<PublicCategoryDto> {
    const created = await this.categoryService.createCategory(
      client,
      storeId,
      createCategoryPayload
    );

    return PublicCategoryDto.schema.parse(created);
  }

  @Get()
  @UseGuards(ZodValidation({ params: storeIdParamsSchema }))
  @DocsCategoryGetList()
  async list(
    @Client() client: Owner,
    @Param("storeId") storeId: string
  ): Promise<PublicCategoryDto[]> {
    const categories = await this.categoryService.getCategoryList(
      client,
      storeId
    );

    return categories.map((category) =>
      PublicCategoryDto.schema.parse(category)
    );
  }

  @Put("reorder")
  @UseGuards(
    ZodValidation({
      params: storeIdParamsSchema,
      body: reorderCategoriesPayloadSchema,
    })
  )
  @DocsCategoryReorder()
  async reorder(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Body() reorderCategoriesPayload: ReorderCategoriesPayloadDto
  ): Promise<PublicCategoryDto[]> {
    const reordered = await this.categoryService.reorderCategories(
      client,
      storeId,
      reorderCategoriesPayload
    );

    return reordered.map((category) =>
      PublicCategoryDto.schema.parse(category)
    );
  }

  @Get(":categoryId")
  @UseGuards(ZodValidation({ params: storeIdAndCategoryIdParamsSchema }))
  @DocsCategoryGetUnique()
  async unique(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("categoryId") categoryId: string
  ): Promise<PublicCategoryDto> {
    const category = await this.categoryService.getCategoryUnique(
      client,
      storeId,
      categoryId
    );

    return PublicCategoryDto.schema.parse(category);
  }

  @Patch(":categoryId")
  @UseGuards(
    ZodValidation({
      params: storeIdAndCategoryIdParamsSchema,
      body: updateCategoryPayloadSchema,
    })
  )
  @DocsCategoryUpdate()
  async partialUpdate(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("categoryId") categoryId: string,
    @Body() updateCategoryPayload: UpdateCategoryPayloadDto
  ): Promise<PublicCategoryDto> {
    const updated = await this.categoryService.partialUpdateCategory(
      client,
      storeId,
      categoryId,
      updateCategoryPayload
    );

    return PublicCategoryDto.schema.parse(updated);
  }

  @Delete(":categoryId")
  @HttpCode(204)
  @UseGuards(ZodValidation({ params: storeIdAndCategoryIdParamsSchema }))
  @DocsCategoryDelete()
  async delete(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("categoryId") categoryId: string
  ): Promise<void> {
    await this.categoryService.deleteCategory(client, storeId, categoryId);
  }
}
