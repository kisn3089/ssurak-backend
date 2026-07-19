import { Controller, Param, Get, UseGuards, Body, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  DocsSessionGetList,
  DocsSessionGetUnique,
  DocsSessionUpdate,
} from "src/docs/tableSession.docs";
import {
  updateSessionPayloadSchema,
  storeIdParamsSchema,
  storeIdAndSessionIdSchema,
  updateCustomerSessionPayloadSchema,
} from "@ssurak/schema";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import type { z } from "zod";
import { SessionService } from "./session.service";
import { PublicSessionWithTableDto } from "src/dto/response/session.dto";
import { PublicTableSessionDto } from "src/dto/response/table.dto";
import { StoreAccessGuard } from "src/utils/guards/store-access.guard";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";

export type UpdateTableSessionDto = z.infer<typeof updateSessionPayloadSchema>;
export type UpdateCustomerTableSessionDto = z.infer<
  typeof updateCustomerSessionPayloadSchema
>;

@ApiTags("Table Session")
@Controller()
@UseGuards(JwtAuthGuard, StoreAccessGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get(":storeId/sessions")
  @UseGuards(ZodValidation({ params: storeIdParamsSchema }))
  @DocsSessionGetList()
  async list(
    @Param("storeId") storeId: string
  ): Promise<PublicSessionWithTableDto[]> {
    const sessions = await this.sessionService.getSessionList(storeId);
    return PublicSessionWithTableDto.schema.array().parse(sessions);
  }

  @Get(":storeId/sessions/:sessionId")
  @UseGuards(ZodValidation({ params: storeIdAndSessionIdSchema }))
  @DocsSessionGetUnique()
  async unique(
    @Param("storeId") storeId: string,
    @Param("sessionId") sessionId: string
  ): Promise<PublicSessionWithTableDto> {
    return PublicSessionWithTableDto.schema.parse(
      await this.sessionService.getSessionUniqueByOwner({ sessionId, storeId })
    );
  }

  @Patch(":storeId/sessions/:sessionId")
  @UseGuards(
    ZodValidation({
      params: storeIdAndSessionIdSchema,
      body: updateSessionPayloadSchema,
    })
  )
  @DocsSessionUpdate()
  async partialUpdate(
    @Param("storeId") storeId: string,
    @Param("sessionId") sessionId: string,
    @Body() updateSessionPayload: UpdateTableSessionDto
  ): Promise<PublicTableSessionDto> {
    return PublicTableSessionDto.schema.parse(
      await this.sessionService.getSessionAndPartialUpdate(
        { storeId, sessionId },
        updateSessionPayload
      )
    );
  }
}
