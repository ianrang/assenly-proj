import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "docs/**",
    "scripts/**",
  ]),
  // ──────────────────────────────────────────────────────
  // _ prefix 변수 허용 (destructuring omit 패턴)
  // ──────────────────────────────────────────────────────
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      }],
    },
  },

  // ──────────────────────────────────────────────────────
  // 4-Layer Dependency DAG Enforcement
  // ──────────────────────────────────────────────────────

  // shared/ → server/, client/ import 금지
  {
    files: ["src/shared/**/*.ts", "src/shared/**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/server/*", "@/client/*", "@/app/*"],
          message: "shared/ cannot import from server/, client/, or app/.",
        }],
      }],
    },
  },
  // server/ → client/ import 금지
  {
    files: ["src/server/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/client/*"],
            message: "server/ cannot import from client/.",
          },
          {
            group: ["@/app/*"],
            message: "server/ cannot import from app/.",
          },
        ],
      }],
    },
  },
  // client/ → server/ import 금지
  {
    files: ["src/client/**/*.ts", "src/client/**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/server/*"],
            message: "client/ cannot import from server/. Use API routes instead.",
          },
          {
            group: ["@/app/*"],
            message: "client/ cannot import from app/.",
          },
        ],
      }],
    },
  },
  // core/ → features/ 역방향 금지
  {
    files: ["src/server/core/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/server/features/*"],
          message: "server/core/ must not depend on server/features/.",
        }],
      }],
    },
  },
  {
    files: ["src/client/core/**/*.ts", "src/client/core/**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/client/features/*"],
          message: "client/core/ must not depend on client/features/.",
        }],
      }],
    },
  },
]);

export default eslintConfig;
