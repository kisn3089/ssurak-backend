import { createOwnerPayloadSchema } from "./owner.schema";

export const signInPayloadSchema = createOwnerPayloadSchema.pick({
  email: true,
  password: true,
});
