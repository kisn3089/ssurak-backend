import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from "@nestjs/swagger";
import {
  PublicTableSessionDto,
  TableWithStoreContextDto,
} from "src/dto/response/table.dto";
import { PublicSessionWithTableDto } from "src/dto/response/session.dto";
import { CreateSessionPayloadDto } from "src/dto/request/session.dto";
import { paramsDocs } from "./params.docs";

const meta = {
  findOrCreate: {
    summary: "활성화된 세션 조회 또는 생성 후 매장 페이지로 리다이렉트",
    ok: {
      status: 302,
      description: "세션 쿠키 발급 후 `/stores/{storePublicId}`로 리다이렉트",
      headers: {
        Location: {
          description: "리다이렉트 대상 매장 페이지 경로",
          schema: { type: "string", example: "/stores/abc123" },
        },
        "Set-Cookie": {
          description: "세션 토큰 쿠키",
          schema: { type: "string" },
        },
      },
    },
  },
  getList: {
    summary: "세션 목록 조회 (매장 소유자)",
    ok: { status: 200, description: "세션 목록 반환" },
  },
  getUnique: {
    summary: "특정 세션 조회 (매장 소유자)",
    ok: { status: 200, description: "세션 정보 반환" },
  },
  getAliveSession: {
    summary: "활성 세션 조회 (고객)",
    ok: { status: 200, description: "활성 세션 정보 반환" },
  },
  getStoreContext: {
    summary: "세션의 매장 컨텍스트 조회",
    ok: { status: 200, description: "테이블, 매장, 메뉴 정보 반환" },
  },
  update: {
    summary: "세션 수정 (만료 연장 등)",
    ok: { status: 200, description: "세션 수정 성공" },
  },
  unauthorized: { status: 401, description: "인증되지 않은 요청" },
  sessionUnauthorized: { status: 401, description: "세션 인증 실패" },
  notFound: { status: 404, description: "세션을 찾을 수 없음" },
};

export const DocsSessionGetList = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: meta.getList.summary }),
    ApiParam(paramsDocs.storeId),
    ApiQuery(paramsDocs.query.filter.session),
    ApiQuery(paramsDocs.query.include.orderItems),
    ApiResponse({ ...meta.getList.ok, type: [PublicSessionWithTableDto] }),
    ApiResponse(meta.unauthorized)
  );

export const DocsSessionGetUnique = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: meta.getUnique.summary }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.sessionId),
    ApiQuery(paramsDocs.query.include.orderItems),
    ApiResponse({ ...meta.getUnique.ok, type: PublicSessionWithTableDto }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsSessionUpdate = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: meta.update.summary }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.sessionId),
    ApiResponse({ ...meta.update.ok, type: PublicTableSessionDto }),
    ApiResponse(meta.sessionUnauthorized)
  );

export const DocsSessionFindOrCreate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.findOrCreate.summary }),
    ApiBody({ type: CreateSessionPayloadDto }),
    ApiResponse(meta.findOrCreate.ok)
  );

export const DocsSessionGetAlive = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getAliveSession.summary }),
    ApiParam(paramsDocs.sessionToken),
    ApiResponse({ ...meta.getAliveSession.ok, type: PublicTableSessionDto }),
    ApiResponse(meta.sessionUnauthorized)
  );

export const DocsSessionUpdateByCustomer = () =>
  applyDecorators(
    ApiOperation({ summary: meta.update.summary }),
    ApiParam(paramsDocs.sessionToken),
    ApiResponse({ ...meta.update.ok, type: PublicTableSessionDto }),
    ApiResponse(meta.sessionUnauthorized)
  );

export const DocsSessionGetStoreContext = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getStoreContext.summary }),
    ApiParam(paramsDocs.sessionToken),
    ApiResponse({ ...meta.getStoreContext.ok, type: TableWithStoreContextDto }),
    ApiResponse(meta.sessionUnauthorized)
  );
