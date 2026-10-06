// @ts-check
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  // 全局忽略（独立对象=全局生效）：测试文件不进 bundle；构建脚本是 Node 侧工具不是插件代码
  { ignores: ["**/*.test.ts", "node_modules/**", "main.js", "esbuild.config.mjs", "version-bump.mjs"] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mjs", "esbuild.config.mjs", "version-bump.mjs"],
        },
      },
    },
  },
]);
