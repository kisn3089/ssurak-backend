import z from "zod";
import { isoDateTime } from "./common.response";

/** 로그인·토큰 재발급 응답. */
export const accessTokenResponseSchema = z.object({
  accessToken: z.string().describe("액세스 토큰"),
  expiresAt: isoDateTime().describe("토큰 만료 시간"),
});
