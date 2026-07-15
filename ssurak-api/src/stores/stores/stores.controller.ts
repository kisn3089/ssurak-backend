import {
  Controller,
  Delete,
  Get,
  NotImplementedException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { StoresService } from "./stores.service";
import { Client } from "src/decorators/client.decorator";
import type { User } from "@ssurak/db";
import { PublicStoreDto } from "src/dto/response/store.dto";
import {
  DocsStoreCreate,
  DocsStoreDelete,
  DocsStoreGetList,
  DocsStoreGetUnique,
} from "src/docs/store.docs";
import { StoreAccessGuard } from "src/utils/guards/store-access.guard";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";

@ApiTags("Store")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class StoresController {
  constructor(private readonly storeService: StoresService) {}

  @Post()
  @DocsStoreCreate()
  create(): void {
    throw new NotImplementedException("This feature is not yet implemented");
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

  @Delete(":storeId")
  @UseGuards(StoreAccessGuard)
  @DocsStoreDelete()
  delete(): void {
    throw new NotImplementedException("This feature is not yet implemented");
  }
}
