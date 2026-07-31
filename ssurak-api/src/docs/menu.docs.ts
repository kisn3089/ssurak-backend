import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { PublicMenuDto } from "src/dto/response/menu.dto";
import {
  CreateMenuPayloadDto,
  ReorderMenusPayloadDto,
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
  reorder: {
    summary: "카테고리 내 메뉴 순서 전체 교체",
    ok: { status: 200, description: "재정렬된 메뉴 목록 반환" },
  },
  delete: {
    summary: "메뉴 삭제 (소프트 삭제)",
    ok: { status: 204, description: "메뉴 삭제 성공" },
  },
  badRequest: { status: 400, description: "잘못된 요청" },
  unauthorized: { status: 401, description: "인증되지 않은 요청" },
  notFound: { status: 404, description: "메뉴를 찾을 수 없음" },
  orderMismatch: {
    status: 409,
    description:
      "요청한 목록이 카테고리의 현재 메뉴 집합과 불일치(stale 목록), " +
      "또는 같은 매장의 다른 정렬 변경이 처리 중(REORDER_IN_PROGRESS)",
  },
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

export const DocsMenuReorder = () =>
  applyDecorators(
    ApiOperation({
      summary: meta.reorder.summary,
      description:
        "한 카테고리의 살아 있는 메뉴 전체를 원하는 순서로 나열해 보낸다. 부분 목록은 " +
        "409로 거절되며, 같은 배열을 여러 번 보내도 결과가 같다(멱등). " +
        "카테고리 간 이동은 메뉴 수정의 categoryId로 처리한다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiBody({ type: ReorderMenusPayloadDto }),
    ApiResponse({ ...meta.reorder.ok, type: [PublicMenuDto] }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.notFound),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.orderMismatch)
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
