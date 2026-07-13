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

export type UpdateCustomerTableSessionDto = z.infer<
  typeof updateCustomerSessionPayloadSchema
>;

@ApiTags("Customer Session")
@Controller("sessions")
export class CustomerSessionController {
  constructor(private readonly sessionService: SessionService) {}

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

    return TableWithStoreContextDto.schema.parse(storeUntilMenus);
  }
}
