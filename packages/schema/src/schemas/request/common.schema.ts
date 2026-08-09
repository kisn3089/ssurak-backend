import z from "zod";
import type { ModelName } from "../../types/modelName.interface";

const cuid2 = (modelName: ModelName | "QRCode" | "CartItem") => {
  return z
    .string()
    .min(24, `${modelName}Id 길이가 올바르지 않습니다.`)
    .max(32)
    .regex(/^[a-z0-9]+$/, `${modelName}Id 형식이 올바르지 않습니다.`);
};

/**
 * 가격 상한. 도메인 한계이자 DB 방어선이다.
 *
 * `menu.price`·`menuOptionChoice.priceDelta`는 MySQL `int`(최대 2,147,483,647)라,
 * 스키마에 상한이 없으면 큰 값이 zod를 통과한 뒤 Prisma P2020으로 떨어진다 —
 * 그러면 전역 필터가 "데이터 처리 중 오류가 발생했습니다."라는 원인 불명의 400을 내보낸다.
 * 여기서 끊어야 어느 필드가 왜 거절됐는지가 응답에 남는다.
 *
 * 1천만원이면 메뉴 한 개 값으로 충분히 넉넉하고, 수량(최대 99)·옵션 합산까지
 * 곱해도 `unitPrice`·`totalPrice`가 int 범위 안에 남는다.
 */
export const PRICE_MAX = 10_000_000;

const PRICE_MAX_LABEL = "1,000만";

/**
 * 원화에는 소수 단위가 없다 — 가격은 1원 단위 정수로만 받는다.
 * `.int()`가 없으면 `1000.5` 같은 값이 검증을 통과한 뒤 DB에서 조용히 잘려 저장된다
 * (에러 없이 값이 바뀌므로 400보다 나쁘다).
 */
const menuPrice = z
  .number({
    required_error: "메뉴 가격은 필수입니다.",
    invalid_type_error: "메뉴 가격은 숫자로 입력해 주세요.",
  })
  .int("메뉴 가격은 1원 단위 정수로 입력해 주세요.")
  .min(0, "메뉴 가격은 0원 이상이어야 합니다.")
  .max(PRICE_MAX, `메뉴 가격은 ${PRICE_MAX_LABEL}원을 넘을 수 없습니다.`);

/**
 * 선택지 추가 금액. 할인 옵션을 위해 음수를 허용한다 —
 * 메뉴가를 넘는 할인은 주문 검증(MENU_OPTION_PRICE_UNDERFLOW)에서 걸린다.
 */
const priceDelta = z
  .number({
    required_error: "옵션 금액은 필수입니다.",
    invalid_type_error: "옵션 금액은 숫자로 입력해 주세요.",
  })
  .int("옵션 금액은 1원 단위 정수로 입력해 주세요.")
  .min(-PRICE_MAX, `옵션 금액은 -${PRICE_MAX_LABEL}원 이상이어야 합니다.`)
  .max(PRICE_MAX, `옵션 금액은 ${PRICE_MAX_LABEL}원을 넘을 수 없습니다.`);

export const commonSchema = { cuid2, menuPrice, priceDelta };
