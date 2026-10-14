import type { ESLint } from "eslint";

export declare const CONTROL_CLASSES: readonly string[];
export declare const PENDING_CONTROL_CLASS: readonly string[];
export declare const controlKitPlugin: ESLint.Plugin & { rules: NonNullable<ESLint.Plugin["rules"]> };
