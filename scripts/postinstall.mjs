// pnpm install이 node_modules를 재구성하면서 생성된 Prisma Client가
// 스텁으로 되돌아가는 문제를 막기 위해 install 후 generate를 실행한다.
//
// 단, 실행 가능한 환경에서만:
// - 도커의 의존성 설치 스테이지들은 package.json만 복사하므로 이 파일
//   자체가 없다 → package.json의 postinstall이 `test -f`로 건너뛴다.
// - 스키마 파일이 없거나(부분 복사) prisma CLI가 없으면(--prod 재설치)
//   경고만 남기고 install 자체는 성공시킨다.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync("db/prisma/schema.prisma")) {
  console.log("[postinstall] prisma schema 없음 — generate 건너뜀");
  process.exit(0);
}

const result = spawnSync(
  "pnpm",
  ["--filter", "@ssurak/db", "exec", "prisma", "generate"],
  { stdio: "inherit" }
);

if (result.status !== 0) {
  console.warn(
    "[postinstall] prisma generate 실패 — 건너뜀 (CLI가 없는 prod 설치 등). " +
      "로컬에서 클라이언트가 깨졌다면 `pnpm db:generate`를 직접 실행하세요."
  );
}
