import { defineConfig } from "vite";
import swc from "unplugin-swc";
import { fileURLToPath } from "node:url";

// vite-node가 esbuild 대신 SWC로 트랜스파일하도록 강제한다.
// SWC는 emitDecoratorMetadata(design:paramtypes)를 방출하므로
// NestJS 생성자 기반 DI가 정상 동작한다. (esbuild는 미지원)
export default defineConfig({
  resolve: {
    alias: {
      // 기존 코드의 bare `src/...` import 해석 (tsconfig paths와 짝을 맞춤)
      src: fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  ssr: {
    // 워크스페이스 .ts 패키지(@ssurak/*)는 심링크로 node_modules에 들어가
    // 기본적으로 externalize된다. noExternal에 넣어 Vite가 SWC로 변환하게 한다.
    noExternal: [/^@ssurak\//],
  },
  // 배포용 번들: 워크스페이스 TS 패키지(@ssurak/*)를 인라인한 단일 파일을 만들어
  // 순수 `node dist/main.mjs` 로 실행한다. node_modules 의존성은 externalize.
  build: {
    ssr: "src/main.ts",
    outDir: "dist",
    target: "node22",
    sourcemap: true,
    rollupOptions: {
      output: {
        // package.json 에 "type": "module" 이 없으므로 확장자로 ESM 명시
        entryFileNames: "main.mjs",
      },
    },
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
    }),
  ],
});
