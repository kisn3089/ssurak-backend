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
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Owner } from "@ssurak/db";
import {
  closureRangeQuerySchema,
  createClosurePayloadSchema,
  replaceBusinessHoursPayloadSchema,
  storeIdAndClosureIdParamsSchema,
  storeIdParamsSchema,
  updateClosurePayloadSchema,
} from "@ssurak/schema";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { Client } from "src/decorators/client.decorator";
import {
  DocsBusinessHoursGet,
  DocsBusinessHoursReplace,
  DocsBusinessStatusGet,
  DocsClosureCreate,
  DocsClosureDelete,
  DocsClosureGetList,
  DocsClosureUpdate,
} from "src/docs/businessHour.docs";
import {
  ClosureRangeQueryDto,
  CreateClosurePayloadDto,
  ReplaceBusinessHoursPayloadDto,
  UpdateClosurePayloadDto,
} from "src/dto/request/businessHour.dto";
import {
  PublicBusinessHourDto,
  PublicClosureDto,
  StoreOpenStateDto,
} from "src/dto/response/businessHour.dto";
import { StoreAccessGuard } from "src/utils/guards/store-access.guard";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import { BusinessHoursService } from "./business-hours.service";

@ApiTags("Store Business Hours")
@ApiBearerAuth()
@Controller(":storeId")
@UseGuards(JwtAuthGuard, StoreAccessGuard)
export class BusinessHoursController {
  constructor(private readonly businessHoursService: BusinessHoursService) {}

  @Get("business-hours")
  @UseGuards(ZodValidation({ params: storeIdParamsSchema }))
  @DocsBusinessHoursGet()
  async listHours(
    @Client() client: Owner,
    @Param("storeId") storeId: string
  ): Promise<PublicBusinessHourDto[]> {
    const hours = await this.businessHoursService.getBusinessHours(
      client,
      storeId
    );

    return PublicBusinessHourDto.schema.array().parse(hours);
  }

  @Put("business-hours")
  @UseGuards(
    ZodValidation({
      params: storeIdParamsSchema,
      body: replaceBusinessHoursPayloadSchema,
    })
  )
  @DocsBusinessHoursReplace()
  async replaceHours(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Body() replacePayload: ReplaceBusinessHoursPayloadDto
  ): Promise<PublicBusinessHourDto[]> {
    const replaced = await this.businessHoursService.replaceBusinessHours(
      client,
      storeId,
      replacePayload
    );

    return PublicBusinessHourDto.schema.array().parse(replaced);
  }

  @Get("business-status")
  @UseGuards(ZodValidation({ params: storeIdParamsSchema }))
  @DocsBusinessStatusGet()
  async status(
    @Client() client: Owner,
    @Param("storeId") storeId: string
  ): Promise<StoreOpenStateDto> {
    const state = await this.businessHoursService.getOpenState(client, storeId);

    return StoreOpenStateDto.schema.parse(state);
  }

  @Get("closures")
  @UseGuards(
    ZodValidation({
      params: storeIdParamsSchema,
      query: closureRangeQuerySchema,
    })
  )
  @DocsClosureGetList()
  async listClosures(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Query() range: ClosureRangeQueryDto
  ): Promise<PublicClosureDto[]> {
    const closures = await this.businessHoursService.getClosures(
      client,
      storeId,
      range
    );

    return PublicClosureDto.schema.array().parse(closures);
  }

  @Post("closures")
  @UseGuards(
    ZodValidation({
      params: storeIdParamsSchema,
      body: createClosurePayloadSchema,
    })
  )
  @DocsClosureCreate()
  async createClosure(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Body() createPayload: CreateClosurePayloadDto
  ): Promise<PublicClosureDto> {
    const created = await this.businessHoursService.createClosure(
      client,
      storeId,
      createPayload
    );

    return PublicClosureDto.schema.parse(created);
  }

  @Patch("closures/:closureId")
  @UseGuards(
    ZodValidation({
      params: storeIdAndClosureIdParamsSchema,
      body: updateClosurePayloadSchema,
    })
  )
  @DocsClosureUpdate()
  async partialUpdateClosure(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("closureId") closureId: string,
    @Body() updatePayload: UpdateClosurePayloadDto
  ): Promise<PublicClosureDto> {
    const updated = await this.businessHoursService.partialUpdateClosure(
      client,
      storeId,
      closureId,
      updatePayload
    );

    return PublicClosureDto.schema.parse(updated);
  }

  @Delete("closures/:closureId")
  @HttpCode(204)
  @UseGuards(ZodValidation({ params: storeIdAndClosureIdParamsSchema }))
  @DocsClosureDelete()
  async deleteClosure(
    @Client() client: Owner,
    @Param("storeId") storeId: string,
    @Param("closureId") closureId: string
  ): Promise<void> {
    await this.businessHoursService.deleteClosure(client, storeId, closureId);
  }
}
