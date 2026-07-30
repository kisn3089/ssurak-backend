import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { PublicCategoryDto } from "src/dto/response/category.dto";
import {
  CreateCategoryPayloadDto,
  ReorderCategoriesPayloadDto,
  UpdateCategoryPayloadDto,
} from "src/dto/request/category.dto";
import { paramsDocs } from "./params.docs";

const meta = {
  create: {
    summary: "카테고리 생성",
    ok: { status: 201, description: "카테고리 생성 성공" },
  },
  getList: {
    summary: "카테고리 목록 조회",
    ok: { status: 200, description: "카테고리 목록 반환 (표시 순서 오름차순)" },
  },
  getUnique: {
    summary: "특정 카테고리 조회",
    ok: { status: 200, description: "카테고리 정보 반환" },
  },
  update: {
    summary: "카테고리 수정",
    ok: { status: 200, description: "카테고리 수정 성공" },
  },
  reorder: {
    summary: "카테고리 순서 전체 교체",
    ok: { status: 200, description: "재정렬된 카테고리 목록 반환" },
  },
  delete: {
    summary: "카테고리 삭제",
    ok: { status: 204, description: "카테고리 삭제 성공" },
  },
  badRequest: { status: 400, description: "잘못된 요청" },
  unauthorized: { status: 401, description: "인증되지 않은 요청" },
  notFound: { status: 404, description: "카테고리를 찾을 수 없음" },
  duplicatedName: { status: 409, description: "매장 내 중복된 카테고리 이름" },
  orderMismatch: {
    status: 409,
    description:
      "요청한 목록이 매장의 현재 카테고리 집합과 불일치 (stale 목록)",
  },
  hasMenus: {
    status: 409,
    description: "메뉴가 남아 있어 삭제할 수 없음",
  },
};

export const DocsCategoryCreate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.create.summary }),
    ApiParam(paramsDocs.storeId),
    ApiBody({ type: CreateCategoryPayloadDto }),
    ApiResponse({ ...meta.create.ok, type: PublicCategoryDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.duplicatedName)
  );

export const DocsCategoryGetList = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getList.summary }),
    ApiParam(paramsDocs.storeId),
    ApiResponse({ ...meta.getList.ok, type: [PublicCategoryDto] }),
    ApiResponse(meta.unauthorized)
  );

export const DocsCategoryGetUnique = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getUnique.summary }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.categoryId),
    ApiResponse({ ...meta.getUnique.ok, type: PublicCategoryDto }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsCategoryUpdate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.update.summary }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.categoryId),
    ApiBody({ type: UpdateCategoryPayloadDto }),
    ApiResponse({ ...meta.update.ok, type: PublicCategoryDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound),
    ApiResponse(meta.duplicatedName)
  );

export const DocsCategoryReorder = () =>
  applyDecorators(
    ApiOperation({
      summary: meta.reorder.summary,
      description:
        "매장 카테고리 전체를 원하는 순서로 나열해 보낸다. 부분 목록은 409로 거절되며, " +
        "같은 배열을 여러 번 보내도 결과가 같다(멱등).",
    }),
    ApiParam(paramsDocs.storeId),
    ApiBody({ type: ReorderCategoriesPayloadDto }),
    ApiResponse({ ...meta.reorder.ok, type: [PublicCategoryDto] }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.orderMismatch)
  );

export const DocsCategoryDelete = () =>
  applyDecorators(
    ApiOperation({ summary: meta.delete.summary }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.categoryId),
    ApiResponse(meta.delete.ok),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound),
    ApiResponse(meta.hasMenus)
  );
