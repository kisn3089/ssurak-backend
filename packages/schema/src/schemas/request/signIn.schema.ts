import z from "zod";

/**
 * 로그인 페이로드. 회원가입 비밀번호 복잡도 규칙을 재사용하지 않는다.
 * 로그인에서 형식 검증은 정책 노출과 기존 유저 거짓 거부(정책 강화 시)만
 * 만들 수 있고, 검증할 것은 자격 증명 일치 여부뿐이다.
 */
export const signInPayloadSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});
