import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { PublicOrderWithItemsDto } from "src/dto/response/order.dto";
import { CreateOrderPayloadDto } from "src/dto/request/order.dto";
import { paramsDocs } from "./params.docs";

const meta = {
  create: {
    summary: "주문 생성",
    ok: { status: 201, description: "주문 생성 성공" },
  },
  getList: {
    summary: "주문 목록 조회",
    ok: { status: 200, description: "주문 목록 반환" },
  },
  getUnique: {
    summary: "특정 주문 조회",
    ok: { status: 200, description: "주문 정보 반환" },
  },
  delete: {
    summary: "주문 취소",
    ok: { status: 200, description: "주문 취소 성공" },
  },
  badRequest: { status: 400, description: "잘못된 요청" },
  unauthorized: { status: 401, description: "세션 인증 실패" },
  notFound: { status: 404, description: "주문을 찾을 수 없음" },
};

export const DocsCustomerOrderCreate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.create.summary }),
    ApiParam(paramsDocs.sessionToken),
    ApiBody({ type: CreateOrderPayloadDto }),
    ApiResponse({ ...meta.create.ok, type: PublicOrderWithItemsDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized)
  );

export const DocsCustomerOrderGetList = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getList.summary }),
    ApiParam(paramsDocs.sessionToken),
    ApiResponse({ ...meta.getList.ok, type: [PublicOrderWithItemsDto] }),
    ApiResponse(meta.unauthorized)
  );

export const DocsCustomerOrderGetUnique = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getUnique.summary }),
    ApiParam(paramsDocs.sessionToken),
    ApiParam(paramsDocs.orderId),
    ApiResponse({ ...meta.getUnique.ok, type: PublicOrderWithItemsDto }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsCustomerOrderDelete = () =>
  applyDecorators(
    ApiOperation({ summary: meta.delete.summary }),
    ApiParam(paramsDocs.sessionToken),
    ApiParam(paramsDocs.orderId),
    ApiResponse({ ...meta.delete.ok, type: PublicOrderWithItemsDto }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );
