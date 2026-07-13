import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // 무시할 파일 지정 (전역)
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
  },

  // 기본 JavaScript 권장 설정
  js.configs.recommended,

  // TypeScript ESLint 권장 설정
  ...tseslint.configs.recommended,

  // Prettier 설정 (마지막에 위치하여 다른 포매팅 규칙을 override)
  prettier,

  {
    files: ["**/*.ts", "**/*.tsx"],

    plugins: {
      prettier: prettierPlugin,
    },

    rules: {
      "prettier/prettier": "error",
      "@typescript-eslint/interface-name-prefix": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
