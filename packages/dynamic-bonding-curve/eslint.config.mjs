import { config } from "@meteora-ag/ts-sdk-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
    ...config,
    {
        ignores: ["scripts/**"],
    },
    {
        rules: {
            "no-console": ["error", { allow: ["warn", "error"] }]
        }
    },
    {
        files: ["tests/**/*.ts", "**/*.test.ts"],
        rules: {
            "no-console": "off"
        }
    }
];
