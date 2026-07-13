import { applyDecorators } from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
} from "@nestjs/swagger";
import { COOKIE_TABLE } from "@ssurak/db";
import { AccessTokenDto } from "src/dto/response/access-token.dto";
import { SignInPayloadDto } from "src/dto/request/auth.dto";

const meta = {
  signIn: {
    summary: "로그인을 수행하여 토큰을 발급",
    ok: {
      status: 200,
      description: "사용자 인증을 통해 액세스 토큰 발급",
    },
  },
  refresh: {
    summary: "쿠키의 리프레시 토큰으로 액세스 토큰 재발급",
    ok: {
      status: 200,
      description: "리프레시 토큰을 통해 액세스 토큰 재발급",
    },
  },
  unauthorized: { status: 401, description: "인증되지 않은 사용자" },
};

export const DocsOwnerSignIn = () =>
  applyDecorators(
    ApiOperation({ summary: meta.signIn.summary }),
    ApiBody({ type: SignInPayloadDto }),
    ApiResponse({ ...meta.signIn.ok, type: AccessTokenDto }),
    ApiResponse(meta.unauthorized)
  );

export const DocsAdminSignIn = () =>
  applyDecorators(
    ApiOperation({ summary: meta.signIn.summary }),
    ApiBody({ type: SignInPayloadDto }),
    ApiResponse({ ...meta.signIn.ok, type: AccessTokenDto }),
    ApiResponse(meta.unauthorized)
  );

export const DocsRefreshToken = () =>
  applyDecorators(
    ApiCookieAuth(COOKIE_TABLE.REFRESH),
    ApiOperation({ summary: meta.refresh.summary }),
    ApiResponse({ ...meta.refresh.ok, type: AccessTokenDto }),
    ApiResponse(meta.unauthorized)
  );
