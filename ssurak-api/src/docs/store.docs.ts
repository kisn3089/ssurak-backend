import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { PublicStoreDto } from "src/dto/response/store.dto";
import {
  CreateStorePayloadDto,
  UpdateStorePayloadDto,
} from "src/dto/request/store.dto";
import { paramsDocs } from "./params.docs";

const meta = {
  create: {
    summary: "매장 생성",
    ok: { status: 201, description: "매장 생성 성공" },
  },
  update: {
    summary: "매장 수정",
    ok: { status: 200, description: "매장 수정 성공" },
  },
  getList: {
    summary: "매장 목록 조회",
    ok: { status: 200, description: "매장 목록 반환" },
  },
  getUnique: {
    summary: "특정 매장 조회",
    ok: { status: 200, description: "매장 정보 반환" },
  },
  delete: {
    summary: "매장 삭제",
  },
  notImplemented: { status: 501, description: "구현 예정" },
  badRequest: { status: 400, description: "잘못된 요청" },
  unauthorized: { status: 401, description: "인증되지 않은 요청" },
  notFound: { status: 404, description: "매장을 찾을 수 없음" },
};

export const DocsStoreCreate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.create.summary }),
    ApiBody({ type: CreateStorePayloadDto }),
    ApiResponse({ ...meta.create.ok, type: PublicStoreDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized)
  );

export const DocsStoreUpdate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.update.summary }),
    ApiParam(paramsDocs.storeId),
    ApiBody({ type: UpdateStorePayloadDto }),
    ApiResponse({ ...meta.update.ok, type: PublicStoreDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsStoreGetList = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getList.summary }),
    ApiResponse({ ...meta.getList.ok, type: [PublicStoreDto] }),
    ApiResponse(meta.unauthorized)
  );

export const DocsStoreGetUnique = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getUnique.summary }),
    ApiParam(paramsDocs.storeId),
    ApiResponse({ ...meta.getUnique.ok, type: PublicStoreDto }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsStoreDelete = () =>
  applyDecorators(
    ApiOperation({ summary: meta.delete.summary }),
    ApiParam(paramsDocs.storeId),
    ApiResponse(meta.notImplemented)
  );
