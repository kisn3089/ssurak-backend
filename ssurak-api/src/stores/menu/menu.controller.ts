import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Delete,
  HttpCode,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MenuService } from "./menu.service";
import type { Owner, PublicCategoryWithMenus, PublicMenu } from "@ssurak/db";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import { Client } from "src/decorators/client.decorator";
import { PublicMenuDto } from "../../dto/response/menu.dto";
import {
  createMenuPayloadSchema,
  storeIdAndMenuIdParamsSchema,
  storeIdParamsSchema,
  updateMenuPayloadSchema,
} from "@ssurak/schema";
import {
  DocsMenuCreate,
  DocsMenuDelete,
  DocsMenuGetList,
  DocsMenuGetUnique,
  DocsMenuUpdate,
} from "src/docs/menu.docs";
import {
  CreateMenuPayloadDto,
  UpdateMenuPayloadDto,
} from "src/dto/request/menu.dto";
import { StoreAccessGuard } from "src/utils/guards/store-access.guard";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import {
  CATEGORIES,
  OMIT_CATEGORY_PRIVATE,
} from "src/common/query/session-query.const";
import { CategoryService } from "./category.service";

@ApiTags("Menu")
@ApiBearerAuth()
@Controller(":storeId/menus")
@UseGuards(JwtAuthGuard, StoreAccessGuard)
export class MenuController {
  constructor(
    private readonly menuService: MenuService,
    private readonly categoryService: CategoryService
  ) {}

  @Post()
  @UseGuards(
    ZodValidation({
      params: storeIdParamsSchema,
      body: createMenuPayloadSchema,
    })
  )
  @DocsMenuCreate()
  async create(
    @Param("storeId") storeId: string,
    @Body() createMenuPayload: CreateMenuPayloadDto
  ) {
    return await this.menuService.createMenu(storeId, createMenuPayload);
  }

  @Get()
  @UseGuards(ZodValidation({ params: storeIdParamsSchema }))
  @DocsMenuGetList()
  async list(
    @Client() client: Owner,
    @Param("storeId") storeId: string
  ): Promise<PublicCategoryWithMenus[]> {
    return await this.categoryService.getCategoryList({
      where: {
        store: { publicId: storeId, owner: { id: client.id } },
      },
      ...CATEGORIES,
      omit: OMIT_CATEGORY_PRIVATE,
    });
  }

  @Get(":menuId")
  @UseGuards(ZodValidation({ params: storeIdAndMenuIdParamsSchema }))
  @DocsMenuGetUnique()
  async unique(
    @Param("storeId") storeId: string,
    @Param("menuId") menuId: string
  ): Promise<PublicMenuDto> {
    const findMenu = await this.menuService.getMenuUnique({
      where: {
        publicId: menuId,
        category: { store: { publicId: storeId } },
      },
    });

    return PublicMenuDto.schema.parse(findMenu);
  }

  @Patch(":menuId")
  @UseGuards(
    ZodValidation({
      params: storeIdAndMenuIdParamsSchema,
      body: updateMenuPayloadSchema,
    })
  )
  @DocsMenuUpdate()
  async partialUpdate(
    @Param("storeId") storeId: string,
    @Param("menuId") menuId: string,
    @Body() updateMenuPayload: UpdateMenuPayloadDto
  ): Promise<PublicMenu> {
    return await this.menuService.partialUpdateMenu(
      storeId,
      menuId,
      updateMenuPayload
    );
  }

  @Delete(":menuId")
  @HttpCode(204)
  @UseGuards(ZodValidation({ params: storeIdAndMenuIdParamsSchema }))
  @DocsMenuDelete()
  async delete(
    @Param("storeId") storeId: string,
    @Param("menuId") menuId: string
  ): Promise<void> {
    await this.menuService.softDeleteMenu(storeId, menuId);
  }
}
