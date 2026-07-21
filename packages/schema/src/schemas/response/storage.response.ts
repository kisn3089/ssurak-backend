import z from "zod";

const variantInfoSchema = z.object({
  width: z.number().describe("실제 생성된 가로 픽셀"),
  height: z.number().describe("실제 생성된 세로 픽셀"),
  bytes: z.number().describe("파일 크기(byte)"),
});

/**
 * 이미지 업로드 응답.
 *
 * URL을 내려주지 않는 것이 의도적이다. 업로드 직후의 객체는 `tmp/` 아래에 있고
 * 하루 뒤 lifecycle로 사라지므로, 사라질 URL을 계약에 넣으면 깨진 미리보기가 확정된다.
 * 폼 미리보기는 브라우저의 URL.createObjectURL(선택한 파일)로 처리하고,
 * 실제 CDN URL은 메뉴 저장 후 메뉴 응답의 `images`로 받는다.
 */
export const uploadImageResponseSchema = z.object({
  imageKey: z
    .string()
    .describe(
      "임시 이미지 키. 메뉴 생성/수정 요청에 그대로 실어 보낸다. 24시간 유효"
    ),
  variants: z
    .record(z.string(), variantInfoSchema)
    .describe("생성된 변형별 실측 정보"),
});
