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
import type { Owner } from "@ssurak/db";
import { MenuImageService } from "src/common/image/menu-image.service";
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
