import { afterAll } from "vitest";
import { purgeTracked } from "test/helpers/e2e-cleanup";

// 파일 단위 최상위 afterAll — spec의 afterAll(app.close 포함)이 끝난 뒤 실행된다.
afterAll(async () => {
  await purgeTracked();
});
