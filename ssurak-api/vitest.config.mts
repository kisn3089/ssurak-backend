import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";
import { fileURLToPath } from "node:url";

// NestJS 데코레이터 메타데이터가 필요하므로 esbuild 대신 SWC로 트랜스파일한다.
export default defineConfig({
  resolve: {
    alias: {
      // 기존 코드의 bare `test/...` import 해석
      test: fileURLToPath(new URL("./test", import.meta.url)),
      // 워크스페이스 .ts 패키지(@ssurak/db)를 소스 .ts로 직접 해석한다.
      // 더 구체적인 서브패스를 먼저 둔다(startsWith 매칭 순서).
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
    include: ["test/**/*.spec.ts"],
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
    }),
  ],
});
