import {
  Body,
  Controller,
  Delete,
  Get,
  NotImplementedException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { StoresService } from "./stores.service";
import { Client } from "src/decorators/client.decorator";
import type { Owner, User } from "@ssurak/db";
import {
  createStorePayloadSchema,
  storeIdParamsSchema,
  updateStorePayloadSchema,
} from "@ssurak/schema";
import { PublicStoreDto } from "src/dto/response/store.dto";
import {
  CreateStorePayloadDto,
  UpdateStorePayloadDto,
} from "src/dto/request/store.dto";
import {
  DocsStoreCreate,
  DocsStoreDelete,
  DocsStoreGetList,
  DocsStoreGetUnique,
  DocsStoreUpdate,
} from "src/docs/store.docs";
import { StoreAccessGuard } from "src/utils/guards/store-access.guard";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";

@ApiTags("Store")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class StoresController {
  constructor(private readonly storeService: StoresService) {}

  @Post()
  @UseGuards(ZodValidation({ body: createStorePayloadSchema }))
  @DocsStoreCreate()
  async create(
    @Client() client: Owner,
    @Body() createStorePayload: CreateStorePayloadDto
  ): Promise<PublicStoreDto> {
    const created = await this.storeService.createStore(
      client,
      createStorePayload
    );

    return PublicStoreDto.schema.parse(created);
  }

  @Get()
  @DocsStoreGetList()
  async list(@Client() user: User): Promise<PublicStoreDto[]> {
    const stores = await this.storeService.getStoreList(user);
    return PublicStoreDto.schema.array().parse(stores);
  }

  @Get(":storeId")
  @UseGuards(StoreAccessGuard)
  @DocsStoreGetUnique()
  async unique(
    @Client() user: User,
    @Param("storeId") storeId: string
  ): Promise<PublicStoreDto> {
    return PublicStoreDto.schema.parse(
      await this.storeService.getStoreUnique(user, storeId)
    );
  }

  @Patch(":storeId")
  @UseGuards(
    StoreAccessGuard,
    ZodValidation({
      params: storeIdParamsSchema,
      body: updateStorePayloadSchema,
    })
  )
  @DocsStoreUpdate()
  async partialUpdate(
    @Client() user: User,
    @Param("storeId") storeId: string,
    @Body() updateStorePayload: UpdateStorePayloadDto
  ): Promise<PublicStoreDto> {
    const updated = await this.storeService.partialUpdateStore(
      user,
      storeId,
      updateStorePayload
    );

    return PublicStoreDto.schema.parse(updated);
  }

  @Delete(":storeId")
  @UseGuards(StoreAccessGuard)
  @DocsStoreDelete()
  delete(): void {
    throw new NotImplementedException("This feature is not yet implemented");
  }
}
