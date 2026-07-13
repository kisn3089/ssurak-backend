import z from "zod";
import { storeIdParamsSchema } from "./store.schema";
import { commonSchema } from "./common.schema";

export type CreateTablePayload = z.infer<typeof createTablePayloadSchema>;

export const createTablePayloadSchema = z
  .object({
    tableNumber: z
      .string()
      .trim()
      .min(1, "테이블 번호를 입력해주세요.")
      .max(10, "테이블 번호는 최대 10자까지 가능합니다."),
    seats: z.number().min(1, "좌석 수는 1 이상이어야 합니다.").optional(),
    floor: z.number().optional(),
    isActive: z.boolean().optional(),
    section: z
      .string()
      .max(20, "구역 이름은 최대 20자까지 가능합니다.")
      .optional(),
  })
  .strict();

export const updateTablePayloadSchema = createTablePayloadSchema
  .partial()
  .extend({
    isActive: z.boolean().optional(),
    qrCode: commonSchema.cuid2("QRCode").optional(),
  });

export type UpdateTablePayload = z.infer<typeof updateTablePayloadSchema>;

export const tableIdParamsSchema = z
  .object({ tableId: commonSchema.cuid2("Table") })
  .strict();

export const storeIdAndTableIdParamsSchema =
  storeIdParamsSchema.merge(tableIdParamsSchema);

/** -------- Query --------- */
const booleanStringSchema = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

export const tableListQuerySchema = z.object({
  isActive: booleanStringSchema.optional(),
});
