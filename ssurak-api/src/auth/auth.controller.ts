import { Controller, Post, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthService } from "./services/auth.service";
import {
  DocsAdminSignIn,
  DocsOwnerSignIn,
  DocsRefreshToken,
} from "src/docs/auth.docs";
import { LocalSignInGuard } from "./guards/local-sign-in.guard";
import {
  type Admin,
  type Owner,
  type TokenPayload,
  type User,
} from "@ssurak/db";
import type { Response } from "express";
import { JwtRefreshAuthGuard } from "./guards/jwt-refresh-auth.guard";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import { signInPayloadSchema } from "@ssurak/schema";
import { AccessTokenDto } from "src/dto/response/access-token.dto";
import { Client } from "src/decorators/client.decorator";
import { Jwt } from "src/decorators/jwt.decorator";

@ApiTags("Auth")
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("owner/signin")
  @UseGuards(ZodValidation({ body: signInPayloadSchema }), LocalSignInGuard)
  @DocsOwnerSignIn()
  async ownerSignIn(
    @Client() owner: Owner,
    @Res({ passthrough: true }) response: Response
  ): Promise<AccessTokenDto> {
    return AccessTokenDto.schema.parse(
      await this.authService.createToken(owner, response, "owner")
    );
  }

  @Post("admin/signin")
  @UseGuards(ZodValidation({ body: signInPayloadSchema }), LocalSignInGuard)
  @DocsAdminSignIn()
  async adminSignIn(
    @Client() admin: Admin,
    @Res({ passthrough: true }) response: Response
  ): Promise<AccessTokenDto> {
    return AccessTokenDto.schema.parse(
      await this.authService.createToken(admin, response, "admin")
    );
  }

  @Post("refresh")
  @UseGuards(JwtRefreshAuthGuard)
  @DocsRefreshToken()
  async createTokenByRefreshToken(
    @Client() user: User,
    @Jwt() jwt: TokenPayload,
    @Res({ passthrough: true }) response: Response
  ): Promise<AccessTokenDto> {
    return AccessTokenDto.schema.parse(
      await this.authService.createToken(user, response, jwt.role)
    );
  }
}
