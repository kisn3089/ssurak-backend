import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Client } from "src/decorators/client.decorator";
import type { TokenPayload, User } from "@ssurak/db";
import { DocsMeFind } from "src/docs/me.docs";
import { PublicOwnerDto } from "src/dto/response/owner.dto";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { PublicAdminDto } from "src/dto/response/admin.dto";
import { Jwt } from "src/decorators/jwt.decorator";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";

@ApiTags("Me")
@Controller("me")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor() {}

  @Get()
  @DocsMeFind()
  findMe(
    @Client() user: User,
    @Jwt() jwt: TokenPayload
  ): PublicOwnerDto | PublicAdminDto {
    switch (jwt.role) {
      case "owner":
        return PublicOwnerDto.schema.parse(user);
      case "admin":
        return PublicAdminDto.schema.parse(user);
      default:
        throw new HttpException(
          exceptionContentsIs("INVALID_ROLE"),
          HttpStatus.BAD_REQUEST
        );
    }
  }
}
