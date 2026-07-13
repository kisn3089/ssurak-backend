import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { PublicOwnerDto } from "src/dto/response/owner.dto";
import { paramsDocs } from "./params.docs";
import {
  CreateOwnerPayloadDto,
  UpdateOwnerPayloadDto,
} from "src/dto/request/owner.dto";

const meta = {
  create: {
    summary: "새 매장 소유자 생성",
    ok: { status: 201, description: "매장 소유자 생성 성공" },
  },
  getList: {
    summary: "매장 소유자 목록 조회",
    ok: { status: 200, description: "매장 소유자 목록 반환" },
  },
  getUnique: {
    summary: "특정 매장 소유자 조회",
    ok: { status: 200, description: "매장 소유자 정보 반환" },
  },
  update: {
    summary: "매장 소유자 정보 수정",
    ok: { status: 200, description: "매장 소유자 정보 수정 성공" },
  },
  delete: {
    summary: "매장 소유자 삭제",
    ok: { status: 204, description: "매장 소유자 삭제 성공" },
  },
  badRequest: { status: 400, description: "잘못된 요청" },
  unauthorized: { status: 401, description: "인증되지 않은 요청" },
  notFound: { status: 404, description: "매장 소유자를 찾을 수 없음" },
};

export const DocsOwnerCreate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.create.summary }),
    ApiBody({ type: CreateOwnerPayloadDto }),
    ApiResponse({ ...meta.create.ok, type: PublicOwnerDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized)
  );

export const DocsOwnerGetList = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getList.summary }),
    ApiResponse({ ...meta.getList.ok, type: [PublicOwnerDto] }),
    ApiResponse(meta.unauthorized)
  );

export const DocsOwnerGetUnique = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getUnique.summary }),
    ApiParam(paramsDocs.ownerId),
    ApiResponse({ ...meta.getUnique.ok, type: PublicOwnerDto }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsOwnerUpdate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.update.summary }),
    ApiParam(paramsDocs.ownerId),
    ApiBody({ type: UpdateOwnerPayloadDto }),
    ApiResponse({ ...meta.update.ok, type: PublicOwnerDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsOwnerDelete = () =>
  applyDecorators(
    ApiOperation({ summary: meta.delete.summary }),
    ApiParam(paramsDocs.ownerId),
    ApiResponse(meta.delete.ok),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );
