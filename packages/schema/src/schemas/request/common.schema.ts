import z from "zod";
import type { ModelName } from "../../types/modelName.interface";

const cuid2 = (modelName: ModelName | "QRCode" | "CartItem") => {
  return z
    .string()
    .min(24, `${modelName}Id 길이가 올바르지 않습니다.`)
    .max(32)
    .regex(/^[a-z0-9]+$/, `${modelName}Id 형식이 올바르지 않습니다.`);
};

export const commonSchema = { cuid2 };
