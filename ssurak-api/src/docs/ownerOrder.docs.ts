import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { PublicOrderWithItemsDto } from "src/dto/response/order.dto";
import { BoardTableDto } from "src/dto/response/table.dto";
import { BoardTableSessionDto } from "src/dto/response/session.dto";
import {
  CreateOrderPayloadDto,
  UpdateOrderPayloadDto,
} from "src/dto/request/order.dto";
import { paramsDocs } from "./params.docs";

const meta = {
  create: {
    summary: "주문 생성 (점주)",
    ok: { status: 201, description: "주문 생성 성공" },
  },
  getList: {
    summary: "주문 목록 조회 (점주)",
    ok: { status: 200, description: "주문 목록 반환" },
  },
  getBoard: {
    summary: "매장 주문 보드 조회",
    ok: {
      status: 200,
      description: "테이블별 활성 세션의 full 주문을 한 번에 반환",
    },
  },
  getListByStore: {
    summary: "매장 전체 주문 목록 조회",
    ok: { status: 200, description: "매장의 전체 주문 목록 반환" },
  },
  getActiveSession: {
    summary: "테이블 활성 세션 조회 (점주)",
    ok: {
      status: 200,
      description: "활성 세션(full 주문 포함) 반환, 없으면 빈 배열",
    },
  },
  getUnique: {
    summary: "특정 주문 조회 (점주)",
    ok: { status: 200, description: "주문 정보 반환" },
  },
  update: {
    summary: "주문 수정 (점주)",
    ok: { status: 200, description: "주문 수정 성공" },
  },
  cancel: {
    summary: "주문 취소 (점주)",
    ok: { status: 200, description: "주문 취소 성공" },
  },
  badRequest: { status: 400, description: "잘못된 요청" },
  unauthorized: { status: 401, description: "인증되지 않은 요청" },
  notFound: { status: 404, description: "주문을 찾을 수 없음" },
};

export const DocsOwnerOrderGetBoard = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getBoard.summary }),
    ApiParam(paramsDocs.storeId),
    ApiResponse({ ...meta.getBoard.ok, type: [BoardTableDto] }),
    ApiResponse(meta.unauthorized)
  );

export const DocsOwnerOrderGetListByStore = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getListByStore.summary }),
    ApiParam(paramsDocs.storeId),
    ApiResponse({
      ...meta.getListByStore.ok,
      type: [PublicOrderWithItemsDto],
    }),
    ApiResponse(meta.unauthorized)
  );

export const DocsOwnerOrderGetUnique = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getUnique.summary }),
    ApiParam(paramsDocs.orderId),
    ApiResponse({ ...meta.getUnique.ok, type: PublicOrderWithItemsDto }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsOwnerOrderUpdate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.update.summary }),
    ApiParam(paramsDocs.orderId),
    ApiBody({ type: UpdateOrderPayloadDto }),
    ApiResponse({ ...meta.update.ok, type: PublicOrderWithItemsDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsOwnerOrderCancel = () =>
  applyDecorators(
    ApiOperation({ summary: meta.cancel.summary }),
    ApiParam(paramsDocs.orderId),
    ApiResponse(meta.cancel.ok),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsOwnerOrderGetActiveSession = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getActiveSession.summary }),
    ApiParam(paramsDocs.tableId),
    ApiResponse({
      ...meta.getActiveSession.ok,
      type: [BoardTableSessionDto],
    }),
    ApiResponse(meta.unauthorized)
  );

export const DocsOwnerOrderCreate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.create.summary }),
    ApiParam(paramsDocs.tableId),
    ApiBody({ type: CreateOrderPayloadDto }),
    ApiResponse({ ...meta.create.ok, type: PublicOrderWithItemsDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized)
  );

export const DocsOwnerOrderGetList = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getList.summary }),
    ApiParam(paramsDocs.tableId),
    ApiResponse({ ...meta.getList.ok, type: [PublicOrderWithItemsDto] }),
    ApiResponse(meta.unauthorized)
  );
