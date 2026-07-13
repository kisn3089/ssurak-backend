import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { PublicAdminDto } from "src/dto/response/admin.dto";
import { paramsDocs } from "./params.docs";
import {
  CreateAdminPayloadDto,
  UpdateAdminPayloadDto,
} from "src/dto/request/admin.dto";

const meta = {
  create: {
    summary: "새 관리자 생성",
    ok: { status: 201, description: "관리자 생성 성공" },
  },
  getList: {
    summary: "관리자 목록 조회",
    ok: { status: 200, description: "관리자 목록 반환" },
  },
  getUnique: {
    summary: "특정 관리자 조회",
    ok: { status: 200, description: "관리자 정보 반환" },
  },
  update: {
    summary: "관리자 정보 수정",
    ok: { status: 200, description: "관리자 정보 수정 성공" },
  },
  delete: {
    summary: "관리자 삭제",
    ok: { status: 204, description: "관리자 삭제 성공" },
  },
  badRequest: { status: 400, description: "잘못된 요청" },
  unauthorized: { status: 401, description: "인증되지 않은 요청" },
  notFound: { status: 404, description: "관리자를 찾을 수 없음" },
};

export const DocsAdminCreate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.create.summary }),
    ApiBody({ type: CreateAdminPayloadDto }),
    ApiResponse({ ...meta.create.ok, type: PublicAdminDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized)
  );

export const DocsAdminGetList = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getList.summary }),
    ApiResponse({ ...meta.getList.ok, type: [PublicAdminDto] }),
    ApiResponse(meta.unauthorized)
  );

export const DocsAdminGetUnique = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getUnique.summary }),
    ApiParam(paramsDocs.adminId),
    ApiResponse({ ...meta.getUnique.ok, type: PublicAdminDto }),
    ApiResponse(meta.notFound)
  );

export const DocsAdminUpdate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.update.summary }),
    ApiParam(paramsDocs.adminId),
    ApiBody({ type: UpdateAdminPayloadDto }),
    ApiResponse({ ...meta.update.ok, type: PublicAdminDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsAdminDelete = () =>
  applyDecorators(
    ApiOperation({ summary: meta.delete.summary }),
    ApiParam(paramsDocs.adminId),
    ApiResponse(meta.delete.ok),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );
