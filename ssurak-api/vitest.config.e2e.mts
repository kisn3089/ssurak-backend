import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import swc from "unplugin-swc";
import { fileURLToPath } from "node:url";

// 통합/e2e 테스트 설정.
// 유닛 설정(vitest.config.mts)과 alias를 공유하되,
// 실제 인프라(Redis 등) 접속 정보를 모노레포 루트 .env에서 주입한다.
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      src: fileURLToPath(new URL("./src", import.meta.url)),
      test: fileURLToPath(new URL("./test", import.meta.url)),
      "@ssurak/schema/utils/index.ts": fileURLToPath(
        new URL("../packages/schema/utils/index.ts", import.meta.url)
      ),
      "@ssurak/schema/types/index.ts": fileURLToPath(
        new URL("../packages/schema/types/index.ts", import.meta.url)
      ),
      "@ssurak/schema/schemas/index.ts": fileURLToPath(
        new URL("../packages/schema/schemas/index.ts", import.meta.url)
      ),
      "@ssurak/schema/index.ts": fileURLToPath(
        new URL("../packages/schema/index.ts", import.meta.url)
      ),
      "@ssurak/db/constants": fileURLToPath(
        new URL("../db/constants/index.ts", import.meta.url)
      ),
      "@ssurak/db/types": fileURLToPath(
        new URL("../db/types/index.ts", import.meta.url)
      ),
      "@ssurak/db": fileURLToPath(new URL("../db/index.ts", import.meta.url)),
    },
  },
  ssr: {
    noExternal: [/^@ssurak\//],
  },
  test: {
    globals: false,
    environment: "node",
    root: "./",
    include: ["test/**/*.e2e-spec.ts"],
    // 루트 .env의 REDIS_* 등을 process.env로 주입 (prefix 제한 없음)
    env: loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), ""),
    // 락 경합 테스트(redlock retry) 등 실제 I/O 대기 여유
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      include: ["src/**"],
    },
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
    }),
  ],
}));
