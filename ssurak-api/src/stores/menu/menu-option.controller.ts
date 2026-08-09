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
import type { Owner } from "@ssurak/db";
import {
  createMenuOptionPayloadSchema,
  createOptionChoicePayloadSchema,
  reorderMenuOptionsPayloadSchema,
  reorderOptionChoicesPayloadSchema,
  storeIdAndChoiceIdParamsSchema,
  storeIdAndMenuIdParamsSchema,
  storeIdAndOptionIdParamsSchema,
  updateMenuOptionPayloadSchema,
  updateOptionChoicePayloadSchema,
} from "@ssurak/schema";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { Client } from "src/decorators/client.decorator";
import {
  DocsMenuOptionCreate,
  DocsMenuOptionDelete,
  DocsMenuOptionGetList,
  DocsMenuOptionGetUnique,
  DocsMenuOptionReorder,
  DocsMenuOptionUpdate,
  DocsOptionChoiceCreate,
  DocsOptionChoiceDelete,
  DocsOptionChoiceGetList,
  DocsOptionChoiceGetUnique,
  DocsOptionChoiceReorder,
  DocsOptionChoiceUpdate,
} from "src/docs/menuOption.docs";
import {
  CreateMenuOptionPayloadDto,
  CreateOptionChoicePayloadDto,
  ReorderMenuOptionsPayloadDto,
  ReorderOptionChoicesPayloadDto,
  UpdateMenuOptionPayloadDto,
  UpdateOptionChoicePayloadDto,
} from "src/dto/request/menuOption.dto";
import {
  PublicMenuOptionDto,
  PublicOptionChoiceDto,
} from "src/dto/response/menuOption.dto";
import { StoreAccessGuard } from "src/utils/guards/store-access.guard";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import { MenuOptionChoiceService } from "./menu-option-choice.service";
import { MenuOptionService } from "./menu-option.service";

/**
 * 메뉴 옵션·선택지 관리.
 *
 * 생성만 부모 아래에 중첩하고(어디에 붙일지 알아야 하므로), 개별 리소스는 publicId로
 * 직접 주소를 매긴다. 옵션은 메뉴 응답에 실리지 않으므로 조회도 여기서 한다 —
 * 옵션만 바뀌었을 때 메뉴 캐시까지 무효화하지 않기 위한 분리다.
 */
@ApiTags("Menu Option")
@ApiBearerAuth()
@Controller(":storeId")
@UseGuards(JwtAuthGuard, StoreAccessGuard)
export class MenuOptionController {
  constructor(
    private readonly menuOptionService: MenuOptionService,
    private readonly menuOptionChoiceService: MenuOptionChoiceService
  ) {}

  @Get("menus/:menuId/options")
  @UseGuards(ZodValidation({ params: storeIdAndMenuIdParamsSchema }))
  @DocsMenuOptionGetList()
  async optionList(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("menuId") menuId: string
  ): Promise<PublicMenuOptionDto[]> {
    const options = await this.menuOptionService.getOptionList(
      client,
      storeId,
      menuId
    );

    return options.map((option) => PublicMenuOptionDto.schema.parse(option));
  }

  @Post("menus/:menuId/options")
  @UseGuards(
    ZodValidation({
      params: storeIdAndMenuIdParamsSchema,
      body: createMenuOptionPayloadSchema,
    })
  )
  @DocsMenuOptionCreate()
  async createOption(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("menuId") menuId: string,
    @Body() payload: CreateMenuOptionPayloadDto
  ): Promise<PublicMenuOptionDto> {
    const created = await this.menuOptionService.createOption(
      client,
      storeId,
      menuId,
      payload
    );

    return PublicMenuOptionDto.schema.parse(created);
  }

  @Put("menus/:menuId/options/reorder")
  @UseGuards(
    ZodValidation({
      params: storeIdAndMenuIdParamsSchema,
      body: reorderMenuOptionsPayloadSchema,
    })
  )
  @DocsMenuOptionReorder()
  async reorderOptions(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("menuId") menuId: string,
    @Body() payload: ReorderMenuOptionsPayloadDto
  ): Promise<PublicMenuOptionDto[]> {
    const reordered = await this.menuOptionService.reorderOptions(
      client,
      storeId,
      menuId,
      payload
    );

    return reordered.map((option) => PublicMenuOptionDto.schema.parse(option));
  }

  @Get("options/:optionId")
  @UseGuards(ZodValidation({ params: storeIdAndOptionIdParamsSchema }))
  @DocsMenuOptionGetUnique()
  async optionUnique(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("optionId") optionId: string
  ): Promise<PublicMenuOptionDto> {
    const option = await this.menuOptionService.getOption(
      client,
      storeId,
      optionId
    );

    return PublicMenuOptionDto.schema.parse(option);
  }

  @Patch("options/:optionId")
  @UseGuards(
    ZodValidation({
      params: storeIdAndOptionIdParamsSchema,
      body: updateMenuOptionPayloadSchema,
    })
  )
  @DocsMenuOptionUpdate()
  async updateOption(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("optionId") optionId: string,
    @Body() payload: UpdateMenuOptionPayloadDto
  ): Promise<PublicMenuOptionDto> {
    const updated = await this.menuOptionService.updateOption(
      client,
      storeId,
      optionId,
      payload
    );

    return PublicMenuOptionDto.schema.parse(updated);
  }

  @Delete("options/:optionId")
  @HttpCode(204)
  @UseGuards(ZodValidation({ params: storeIdAndOptionIdParamsSchema }))
  @DocsMenuOptionDelete()
  async deleteOption(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("optionId") optionId: string
  ): Promise<void> {
    await this.menuOptionService.deleteOption(client, storeId, optionId);
  }

  @Get("options/:optionId/choices")
  @UseGuards(ZodValidation({ params: storeIdAndOptionIdParamsSchema }))
  @DocsOptionChoiceGetList()
  async choiceList(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("optionId") optionId: string
  ): Promise<PublicOptionChoiceDto[]> {
    const choices = await this.menuOptionChoiceService.getChoiceList(
      client,
      storeId,
      optionId
    );

    return choices.map((choice) => PublicOptionChoiceDto.schema.parse(choice));
  }

  /** "reorder"가 선택지 ID로 잡히지 않도록 :choiceId 라우트보다 먼저 선언한다. */
  @Put("options/:optionId/choices/reorder")
  @UseGuards(
    ZodValidation({
      params: storeIdAndOptionIdParamsSchema,
      body: reorderOptionChoicesPayloadSchema,
    })
  )
  @DocsOptionChoiceReorder()
  async reorderChoices(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("optionId") optionId: string,
    @Body() payload: ReorderOptionChoicesPayloadDto
  ): Promise<PublicOptionChoiceDto[]> {
    const reordered = await this.menuOptionChoiceService.reorderChoices(
      client,
      storeId,
      optionId,
      payload
    );

    return reordered.map((choice) =>
      PublicOptionChoiceDto.schema.parse(choice)
    );
  }

  @Post("options/:optionId/choices")
  @UseGuards(
    ZodValidation({
      params: storeIdAndOptionIdParamsSchema,
      body: createOptionChoicePayloadSchema,
    })
  )
  @DocsOptionChoiceCreate()
  async createChoice(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("optionId") optionId: string,
    @Body() payload: CreateOptionChoicePayloadDto
  ): Promise<PublicOptionChoiceDto> {
    const created = await this.menuOptionChoiceService.createChoice(
      client,
      storeId,
      optionId,
      payload
    );

    return PublicOptionChoiceDto.schema.parse(created);
  }

  @Get("choices/:choiceId")
  @UseGuards(ZodValidation({ params: storeIdAndChoiceIdParamsSchema }))
  @DocsOptionChoiceGetUnique()
  async choiceUnique(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("choiceId") choiceId: string
  ): Promise<PublicOptionChoiceDto> {
    const choice = await this.menuOptionChoiceService.getChoice(
      client,
      storeId,
      choiceId
    );

    return PublicOptionChoiceDto.schema.parse(choice);
  }

  @Patch("choices/:choiceId")
  @UseGuards(
    ZodValidation({
      params: storeIdAndChoiceIdParamsSchema,
      body: updateOptionChoicePayloadSchema,
    })
  )
  @DocsOptionChoiceUpdate()
  async updateChoice(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("choiceId") choiceId: string,
    @Body() payload: UpdateOptionChoicePayloadDto
  ): Promise<PublicOptionChoiceDto> {
    const updated = await this.menuOptionChoiceService.updateChoice(
      client,
      storeId,
      choiceId,
      payload
    );

    return PublicOptionChoiceDto.schema.parse(updated);
  }

  @Delete("choices/:choiceId")
  @HttpCode(204)
  @UseGuards(ZodValidation({ params: storeIdAndChoiceIdParamsSchema }))
  @DocsOptionChoiceDelete()
  async deleteChoice(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("choiceId") choiceId: string
  ): Promise<void> {
    await this.menuOptionChoiceService.deleteChoice(client, storeId, choiceId);
  }
}
