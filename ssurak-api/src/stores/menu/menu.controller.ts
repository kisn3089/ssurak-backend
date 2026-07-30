import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Put,
  UseGuards,
  Delete,
  HttpCode,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MenuService } from "./menu.service";
import type { Owner } from "@ssurak/db";
import { MenuImageService } from "src/common/image/menu-image.service";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import { Client } from "src/decorators/client.decorator";
import { PublicMenuDto } from "../../dto/response/menu.dto";
import {
  createMenuPayloadSchema,
  reorderMenusPayloadSchema,
  storeIdAndMenuIdParamsSchema,
  storeIdParamsSchema,
  updateMenuPayloadSchema,
} from "@ssurak/schema";
import {
  DocsMenuCreate,
  DocsMenuDelete,
  DocsMenuGetList,
  DocsMenuGetUnique,
  DocsMenuReorder,
  DocsMenuUpdate,
} from "src/docs/menu.docs";
import {
  CreateMenuPayloadDto,
  ReorderMenusPayloadDto,
  UpdateMenuPayloadDto,
} from "src/dto/request/menu.dto";
import { StoreAccessGuard } from "src/utils/guards/store-access.guard";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { CategoryService } from "./category.service";

@ApiTags("Menu")
@ApiBearerAuth()
@Controller(":storeId/menus")
@UseGuards(JwtAuthGuard, StoreAccessGuard)
export class MenuController {
  constructor(
    private readonly menuService: MenuService,
    private readonly categoryService: CategoryService,
    private readonly menuImageService: MenuImageService
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
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Body() createMenuPayload: CreateMenuPayloadDto
  ): Promise<PublicMenuDto> {
    const created = await this.menuService.createMenu(
      storeId,
      client.publicId,
      createMenuPayload
    );

    return PublicMenuDto.schema.parse(this.menuImageService.toView(created));
  }

  @Get()
  @UseGuards(ZodValidation({ params: storeIdParamsSchema }))
  @DocsMenuGetList()
  async list(@Client() client: Owner, @Param("storeId") storeId: string) {
    const categories = await this.categoryService.getCategoryWithMenuList(
      client,
      storeId
    );

    return categories.map((category) => ({
      ...category,
      menus: this.menuImageService.toViewList(category.menus),
    }));
  }

  /**
   * 순서 리소스 전체 교체. `:menuId` 라우트보다 먼저 선언해야
   * "reorder"가 메뉴 ID로 잡히지 않는다.
   */
  @Put("reorder")
  @UseGuards(
    ZodValidation({
      params: storeIdParamsSchema,
      body: reorderMenusPayloadSchema,
    })
  )
  @DocsMenuReorder()
  async reorder(
    @Param("storeId") storeId: string,
    @Body() reorderMenusPayload: ReorderMenusPayloadDto
  ): Promise<PublicMenuDto[]> {
    const reordered = await this.menuService.reorderMenus(
      storeId,
      reorderMenusPayload
    );

    return this.menuImageService
      .toViewList(reordered)
      .map((menu) => PublicMenuDto.schema.parse(menu));
  }

  @Get(":menuId")
  @UseGuards(ZodValidation({ params: storeIdAndMenuIdParamsSchema }))
  @DocsMenuGetUnique()
  async unique(
    @Param("storeId") storeId: string,
    @Param("menuId") menuId: string
  ): Promise<PublicMenuDto> {
    const findMenu = await this.menuService.getMenuUnique(storeId, menuId);

    return PublicMenuDto.schema.parse(this.menuImageService.toView(findMenu));
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
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("menuId") menuId: string,
    @Body() updateMenuPayload: UpdateMenuPayloadDto
  ): Promise<PublicMenuDto> {
    const updated = await this.menuService.partialUpdateMenu(
      storeId,
      menuId,
      client.publicId,
      updateMenuPayload
    );

    return PublicMenuDto.schema.parse(this.menuImageService.toView(updated));
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
