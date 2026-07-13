import { applyDecorators } from "@nestjs/common";
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from "@nestjs/swagger";
import { PublicOrderItemDto } from "src/dto/response/order-item";
import {
  CreateOrderItemPayloadDto,
  UpdateOrderItemPayloadDto,
} from "src/dto/request/order-item.dto";
import { paramsDocs } from "./params.docs";

const meta = {
  create: {
    summary: "주문 항목 생성",
    ok: { status: 201, description: "주문 항목 생성 성공" },
  },
  getList: {
    summary: "주문 항목 목록 조회",
    ok: { status: 200, description: "주문 항목 목록 반환" },
  },
  getUnique: {
    summary: "특정 주문 항목 조회",
    ok: { status: 200, description: "주문 항목 정보 반환" },
  },
  update: {
    summary: "주문 항목 수정",
    ok: { status: 200, description: "주문 항목 수정 성공" },
  },
  delete: {
    summary: "주문 항목 삭제",
    ok: { status: 204, description: "주문 항목 삭제 성공" },
  },
  badRequest: { status: 400, description: "잘못된 요청" },
  unauthorized: { status: 401, description: "인증되지 않은 요청" },
  notFound: { status: 404, description: "주문 항목을 찾을 수 없음" },
};

export const DocsOrderItemCreate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.create.summary }),
    ApiParam(paramsDocs.orderId),
    ApiBody({ type: CreateOrderItemPayloadDto }),
    ApiResponse({ ...meta.create.ok, type: PublicOrderItemDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized)
  );

export const DocsOrderItemGetList = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getList.summary }),
    ApiParam(paramsDocs.orderId),
    ApiQuery(paramsDocs.query.filter.orderItem),
    ApiResponse({ ...meta.getList.ok, type: [PublicOrderItemDto] }),
    ApiResponse(meta.unauthorized)
  );

export const DocsOrderItemGetUnique = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getUnique.summary }),
    ApiParam(paramsDocs.orderItemId),
    ApiResponse({ ...meta.getUnique.ok, type: PublicOrderItemDto }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsOrderItemUpdate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.update.summary }),
    ApiParam(paramsDocs.orderItemId),
    ApiBody({ type: UpdateOrderItemPayloadDto }),
    ApiResponse({ ...meta.update.ok, type: PublicOrderItemDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsOrderItemDelete = () =>
  applyDecorators(
    ApiOperation({ summary: meta.delete.summary }),
    ApiParam(paramsDocs.orderItemId),
    ApiResponse(meta.delete.ok),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );
