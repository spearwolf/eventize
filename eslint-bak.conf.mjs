import { defineConfig, globalIgnores } from "eslint/config";
import { fixupConfigRules, fixupPluginRules } from "@eslint/compat";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([globalIgnores(["**/build", "**/node_modules"]), {
    extends: fixupConfigRules(compat.extends(
        "problems",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:import/errors",
        "plugin:import/warnings",
        "plugin:prettier/recommended",
    )),

    plugins: {
        "@typescript-eslint": fixupPluginRules(typescriptEslint),
    },

    languageOptions: {
        globals: {
            ...globals.jest,
            ...globals.node,
            ...globals.browser,
        },

        parser: tsParser,
        ecmaVersion: 5,
        sourceType: "module",
    },

    settings: {
        "import/resolver": {
            node: {
                extensions: [".ts", ".js"],
            },
        },
    },

    rules: {
        "no-fallthrough": "off",
        "no-undef-init": "off",
        "prefer-rest-params": "off",
        eqeqeq: [2, "smart"],
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/ban-ts-ignore": "off",
        "@typescript-eslint/ban-ts-comment": "off",
        "@typescript-eslint/ban-types": "off",
        "@typescript-eslint/interface-name-prefix": "off",
        "@typescript-eslint/no-empty-interface": "off",
        "@typescript-eslint/no-empty-function": "off",
        "no-use-before-define": "off",

        "@typescript-eslint/no-use-before-define": [2, {
            functions: false,
        }],

        "@typescript-eslint/no-unused-vars": [2, {
            vars: "all",
            args: "after-used",
            argsIgnorePattern: "^_",
        }],

        "@typescript-eslint/consistent-type-assertions": [2, {
            assertionStyle: "as",
            objectLiteralTypeAssertions: "allow-as-parameter",
        }],

        "import/order": [2, {
            "newlines-between": "always-and-inside-groups",

            alphabetize: {
                order: "asc",
            },

            groups: ["builtin", "external", "internal", "parent", "sibling", "index", "unknown"],
        }],
    },
}]);