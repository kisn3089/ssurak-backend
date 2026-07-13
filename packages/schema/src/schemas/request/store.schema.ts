import z from "zod";
import { commonSchema } from "./common.schema";

export const storeIdParamsSchema = z
  .object({
    storeId: commonSchema.cuid2("Store"),
  })
  .strict();
