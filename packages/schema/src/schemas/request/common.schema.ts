import z from "zod";
import type { ModelName } from "../../types/modelName.interface";

const cuid2 = (modelName: ModelName | "QRCode" | "CartItem") => {
  return z
    .string()
    .min(24, `${modelName}Id 길이가 올바르지 않습니다.`)
    .max(32)
    .regex(/^[a-z0-9]+$/, `${modelName}Id 형식이 올바르지 않습니다.`);
};

export const PRICE_MAX = 10_000_000;

const PRICE_MAX_LABEL = "1,000만";

const menuPrice = z
  .number({
    required_error: "메뉴 가격은 필수입니다.",
    invalid_type_error: "메뉴 가격은 숫자로 입력해 주세요.",
  })
  .int("메뉴 가격은 1원 단위 정수로 입력해 주세요.")
  .min(0, "메뉴 가격은 0원 이상이어야 합니다.")
  .max(PRICE_MAX, `메뉴 가격은 ${PRICE_MAX_LABEL}원을 넘을 수 없습니다.`);

const priceDelta = z
  .number({
    required_error: "옵션 금액은 필수입니다.",
    invalid_type_error: "옵션 금액은 숫자로 입력해 주세요.",
  })
  .int("옵션 금액은 1원 단위 정수로 입력해 주세요.")
  .min(-PRICE_MAX, `옵션 금액은 -${PRICE_MAX_LABEL}원 이상이어야 합니다.`)
  .max(PRICE_MAX, `옵션 금액은 ${PRICE_MAX_LABEL}원을 넘을 수 없습니다.`);

export const commonSchema = { cuid2, menuPrice, priceDelta };
