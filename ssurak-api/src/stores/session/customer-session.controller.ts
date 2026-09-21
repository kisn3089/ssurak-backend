import type { Response } from "express";
import {
  Controller,
  Get,
  UseGuards,
  Body,
  Patch,
  Post,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  DocsSessionFindOrCreate,
  DocsSessionGetAlive,
  DocsSessionGetStoreContext,
  DocsSessionUpdateByCustomer,
} from "src/docs/tableSession.docs";
import {
  updateCustomerSessionPayloadSchema,
  createSessionSchema,
} from "@ssurak/schema";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import { COOKIE_TABLE, type TableSession } from "@ssurak/db";
import type { z } from "zod";
import { SessionService } from "./session.service";
import {
  PublicTableSessionDto,
  TableWithStoreContextDto,
} from "src/dto/response/table.dto";
import { CreateSessionPayloadDto } from "src/dto/request/session.dto";
import { Session } from "src/decorators/session.decorator";
import { SessionAuth } from "src/utils/guards/table-session-auth.guard";
import { responseCookie } from "src/utils/cookies";
import { MenuImageService } from "src/common/image/menu-image.service";
import { StoreOpenStateService } from "src/common/business-hours";

export type UpdateCustomerTableSessionDto = z.infer<
  typeof updateCustomerSessionPayloadSchema
>;

@ApiTags("Customer Session")
@Controller("sessions")
export class CustomerSessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly menuImageService: MenuImageService,
    private readonly storeOpenState: StoreOpenStateService
  ) {}

  @Post()
  @UseGuards(ZodValidation({ body: createSessionSchema }))
  @DocsSessionFindOrCreate()
  async findActivatedSessionOrCreate(
    @Body() createSessionPayload: CreateSessionPayloadDto,
    @Res() response: Response
  ): Promise<void> {
    const findOrCreatedSession =
      await this.sessionService.findActivatedSessionOrCreate(
        createSessionPayload
      );

    responseCookie.set(
      response,
      COOKIE_TABLE.SESSION_TOKEN,
      findOrCreatedSession.sessionToken,
      {
        expires: findOrCreatedSession.expiresAt,
      }
    );

    const storePublicId = findOrCreatedSession.table.store.publicId;
    response.redirect(302, `/stores/${storePublicId}`);
  }

  @Get("me")
  @UseGuards(SessionAuth)
  @DocsSessionGetAlive()
  getAliveSession(
    @Session() tableSession: TableSession
  ): PublicTableSessionDto {
    return PublicTableSessionDto.schema.parse(tableSession);
  }

  @Patch("me")
  @UseGuards(
    SessionAuth,
    ZodValidation({ body: updateCustomerSessionPayloadSchema })
  )
  @DocsSessionUpdateByCustomer()
  async partialUpdateByCustomer(
    @Session() tableSession: TableSession,
    @Body() updateSessionPayload: UpdateCustomerTableSessionDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<PublicTableSessionDto> {
    const updatedSession = await this.sessionService.txableUpdateSession(
      tableSession,
      updateSessionPayload
    );

    if (updateSessionPayload.status === "EXTEND_EXPIRES_AT") {
      responseCookie.set(
        response,
        COOKIE_TABLE.SESSION_TOKEN,
        updatedSession.sessionToken,
        {
          expires: updatedSession.expiresAt,
        }
      );
    }

    return PublicTableSessionDto.schema.parse(updatedSession);
  }

  @Get("me/store-context")
  @UseGuards(SessionAuth)
  @DocsSessionGetStoreContext()
  async getStoreContext(
    @Session() tableSession: TableSession
  ): Promise<TableWithStoreContextDto> {
    const storeUntilMenus = await this.sessionService.getStoreContext(
      tableSession.sessionToken
    );
    const { store } = storeUntilMenus.table;

    // 메뉴판 진입 한 번으로 주문 가능 여부까지 알 수 있어야 주문 버튼을 바로 잠글 수 있다.
    const { state } = await this.storeOpenState.storeOpenState(store);

    return TableWithStoreContextDto.schema.parse({
      ...storeUntilMenus,
      table: {
        ...storeUntilMenus.table,
        store: {
          ...store,
          openState: state,
          categories: store.categories.map((category) => ({
            ...category,
            menus: this.menuImageService.toViewList(category.menus),
          })),
        },
      },
    });
  }
}
