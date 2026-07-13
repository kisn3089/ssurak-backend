import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from "@nestjs/swagger";
import {
  CartDataDto,
  CartWithNoticeDto,
  CartWithOptionalNoticeDto,
} from "src/dto/response/cart.dto";
import {
  CreateCartItemPayloadDto,
  UpdateCartItemPayloadDto,
} from "src/dto/request/cart.dto";
import { paramsDocs } from "./params.docs";

const meta = {
  getCart: {
    summary: "장바구니 조회",
    ok: { status: 200, description: "장바구니 반환" },
  },
  addItem: {
    summary: "장바구니 항목 추가",
    ok: { status: 201, description: "항목 추가 후 장바구니 반환" },
  },
  updateItem: {
    summary: "장바구니 항목 수정",
    ok: { status: 200, description: "항목 수정 후 장바구니 반환" },
  },
  removeItem: {
    summary: "장바구니 항목 삭제",
    ok: { status: 200, description: "항목 삭제 후 장바구니 반환" },
  },
  clearCart: {
    summary: "장바구니 전체 비우기",
    ok: { status: 200, description: "장바구니 초기화 완료" },
  },
  getCartByOwner: {
    summary: "장바구니 조회 (점주)",
    ok: { status: 200, description: "장바구니 반환" },
  },
  badRequest: { status: 400, description: "잘못된 요청" },
  unauthorized: { status: 401, description: "세션 인증 실패" },
  notFound: { status: 404, description: "장바구니 또는 항목을 찾을 수 없음" },
  serviceUnavailable: {
    status: 503,
    description: "분산 락 획득 실패 (동시 요청 충돌)",
  },
};

// ============================================================
// Customer Cart
// ============================================================

export const DocsCustomerCartGet = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getCart.summary }),
    ApiParam(paramsDocs.sessionToken),
    ApiResponse({ ...meta.getCart.ok, type: CartDataDto }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsCustomerCartAddItem = () =>
  applyDecorators(
    ApiOperation({ summary: meta.addItem.summary }),
    ApiParam(paramsDocs.sessionToken),
    ApiBody({ type: CreateCartItemPayloadDto }),
    ApiResponse({ ...meta.addItem.ok, type: CartWithNoticeDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.serviceUnavailable)
  );

export const DocsCustomerCartUpdateItem = () =>
  applyDecorators(
    ApiOperation({ summary: meta.updateItem.summary }),
    ApiParam(paramsDocs.sessionToken),
    ApiParam({ name: "cartItemId", description: "장바구니 항목 고유 ID" }),
    ApiBody({ type: UpdateCartItemPayloadDto }),
    ApiResponse({ ...meta.updateItem.ok, type: CartWithOptionalNoticeDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound),
    ApiResponse(meta.serviceUnavailable)
  );

export const DocsCustomerCartRemoveItem = () =>
  applyDecorators(
    ApiOperation({ summary: meta.removeItem.summary }),
    ApiParam(paramsDocs.sessionToken),
    ApiParam({ name: "cartItemId", description: "장바구니 항목 고유 ID" }),
    ApiResponse({ ...meta.removeItem.ok, type: CartWithNoticeDto }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound),
    ApiResponse(meta.serviceUnavailable)
  );

export const DocsCustomerCartClear = () =>
  applyDecorators(
    ApiOperation({ summary: meta.clearCart.summary }),
    ApiParam(paramsDocs.sessionToken),
    ApiResponse(meta.clearCart.ok),
    ApiResponse(meta.unauthorized)
  );

// ============================================================
// Owner Cart
// ============================================================

export const DocsOwnerCartGet = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getCartByOwner.summary }),
    ApiBearerAuth(),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.sessionToken),
    ApiResponse({ ...meta.getCartByOwner.ok, type: CartDataDto }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );
