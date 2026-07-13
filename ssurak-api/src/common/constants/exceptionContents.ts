/** deprecated 추진 */
export type ExceptionContentKeys = keyof typeof EXCEPTION_CONTENTS;

const EXCEPTION_CONTENTS = {
  UNAUTHORIZED: {
    code: "UNAUTHORIZED",
    message: "요청을 처리할 권한이 없습니다.",
  },
  BADREQUEST: {
    code: "BADREQUEST",
    message: "요청이 올바르지 않습니다.",
  },
  FORBIDDEN: {
    code: "FORBIDDEN",
    message: "해당 리소스에 대한 권한이 없습니다.",
  },
  NOT_FOUND: {
    code: "NOT_FOUND",
    message: "요청한 리소스를 찾을 수 없습니다.",
  },
  REFRESH_FAILED: {
    code: "REFRESH_FAILED",
    message: "Refresh token 값이 비어있거나 올바르지 않습니다.",
  },
  SIGNIN_FAILED: {
    code: "SIGNIN_FAILED",
    message: "이메일 또는 비밀번호가 올바르지 않습니다.",
  },
  /** ---Auth--- */
  INVALID_ROLE: {
    code: "INVALID_ROLE",
    message: "유효하지 않은 사용자 역할입니다.",
  },
  /** ---Menu--- */
  MENU_NOT_AVAILABLE: {
    code: "MENU_NOT_AVAILABLE",
    message: "요청한 메뉴는 비활성화 상태입니다.",
  },
  /** ---Table--- */
  TABLE_INACTIVE: {
    code: "TABLE_INACTIVE",
    message: "요청한 테이블은 비활성화 상태입니다.",
  },
  /** ---Table Session--- */
  SESSION_INACTIVE: {
    code: "SESSION_INACTIVE",
    message: "요청한 세션은 비활성화 상태입니다.",
  },
  SESSION_EXPIRED: {
    code: "SESSION_EXPIRED",
    message: "세션이 만료되었습니다.",
  },
  INVALID_TABLE_SESSION: {
    code: "INVALID_TABLE_SESSION",
    message: "세션이 만료되었거나 검증되지 않았습니다. 다시 스캔해주세요.",
  },
  INVALID_PAYLOAD_TABLE_SESSION: {
    code: "INVALID_PAYLOAD_TABLE_SESSION",
    message: "업데이트 요청 본문이 올바르지 않습니다.",
  },
  TABLE_SESSION_NOT_ACTIVE: {
    code: "TABLE_SESSION_NOT_ACTIVE",
    message: "세션이 활성화 상태가 아닙니다.",
  },
  TABLE_SESSION_ALREADY_ACTIVE: {
    code: "TABLE_SESSION_ALREADY_ACTIVE",
    message: "이미 세션이 활성화 상태입니다.",
  },
  /** ----Order ----- */
  ORDER_IS_EMPTY: {
    code: "ORDER_IS_EMPTY",
    message: "주문이 비어 있습니다.",
  },
  TOTAL_PRICE_MISMATCH: {
    code: "TOTAL_PRICE_MISMATCH",
    message: "총 금액이 일치하지 않습니다.",
  },
  MENU_MISMATCH: {
    code: "MENU_MISMATCH",
    message: "요청한 메뉴가 존재하지 않습니다.",
  },
  ORDER_ALREADY_CANCELLED: {
    code: "ORDER_ALREADY_CANCELLED",
    message: "취소된 주문은 변경할 수 없습니다.",
  },
  /** ---Order Item--- */
  MENU_OPTIONS_INVALID: {
    code: "MENU_OPTIONS_INVALID",
    message: "잘못된 옵션 값입니다.",
  },
  MENU_OPTIONS_REQUIRED: {
    code: "MENU_OPTIONS_REQUIRED",
    message: "해당 메뉴의 필수 옵션 값이 잘못되었습니다.",
  },
  MENU_OPTIONS_SHOULD_BE_EMPTY: {
    code: "MENU_OPTIONS_SHOULD_BE_EMPTY",
    message: "해당 메뉴는 선택 옵션 값이 존재할 수 없습니다.",
  },
  /** ---Cart--- */
  CART_ITEM_NOT_FOUND: {
    code: "CART_ITEM_NOT_FOUND",
    message: "장바구니에서 해당 항목을 찾을 수 없습니다.",
  },
  CART_JSON_PARSE_ERROR: {
    code: "CART_JSON_PARSE_ERROR",
    message: "올바른 장바구니 데이터 구조가 아닙니다.",
  },
  CART_LOCK_FAILED: {
    code: "CART_LOCK_FAILED",
    message: "장바구니 잠금에 실패했습니다. 잠시 후 다시 시도해주세요.",
  },
  CART_IS_EMPTY: {
    code: "CART_IS_EMPTY",
    message: "장바구니가 비어 있습니다.",
  },
  /** ---ZOD--- */
  ZOD_PARAMS_FAILED: {
    code: "ZOD_PARAMS_FAILED",
    message: "요청 인자가 올바르지 않습니다.",
  },
  ZOD_PAYLOAD_FAILED: {
    code: "ZOD_PAYLOAD_FAILED",
    message: "요청 본문이 올바르지 않습니다.",
  },
  ZOD_QUERY_FAILED: {
    code: "ZOD_QUERY_FAILED",
    message: "요청 쿼리가 올바르지 않습니다.",
  },
} as const;

export function exceptionContentsIs(key: ExceptionContentKeys) {
  return EXCEPTION_CONTENTS[key];
}
