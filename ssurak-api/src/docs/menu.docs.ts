import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { PublicMenuDto } from "src/dto/response/menu.dto";
import {
  CreateMenuPayloadDto,
  UpdateMenuPayloadDto,
} from "src/dto/request/menu.dto";
import { paramsDocs } from "./params.docs";

const meta = {
  create: {
    summary: "메뉴 생성",
    ok: { status: 201, description: "메뉴 생성 성공" },
  },
  getList: {
    summary: "메뉴 목록 조회",
    ok: { status: 200, description: "메뉴 목록 반환" },
  },
  getUnique: {
    summary: "특정 메뉴 조회",
    ok: { status: 200, description: "메뉴 정보 반환" },
  },
  update: {
    summary: "메뉴 수정",
    ok: { status: 200, description: "메뉴 수정 성공" },
  },
  delete: {
    summary: "메뉴 삭제 (소프트 삭제)",
    ok: { status: 204, description: "메뉴 삭제 성공" },
  },
  badRequest: { status: 400, description: "잘못된 요청" },
  unauthorized: { status: 401, description: "인증되지 않은 요청" },
  notFound: { status: 404, description: "메뉴를 찾을 수 없음" },
};

export const DocsMenuCreate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.create.summary }),
    ApiParam(paramsDocs.storeId),
    ApiBody({ type: CreateMenuPayloadDto }),
    ApiResponse({ ...meta.create.ok, type: PublicMenuDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized)
  );

export const DocsMenuGetList = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getList.summary }),
    ApiParam(paramsDocs.storeId),
    ApiResponse({ ...meta.getList.ok, type: [PublicMenuDto] }),
    ApiResponse(meta.unauthorized)
  );

export const DocsMenuGetUnique = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getUnique.summary }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.menuId),
    ApiResponse({ ...meta.getUnique.ok, type: PublicMenuDto }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsMenuUpdate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.update.summary }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.menuId),
    ApiBody({ type: UpdateMenuPayloadDto }),
    ApiResponse({ ...meta.update.ok, type: PublicMenuDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsMenuDelete = () =>
  applyDecorators(
    ApiOperation({ summary: meta.delete.summary }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.menuId),
    ApiResponse(meta.delete.ok),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );
