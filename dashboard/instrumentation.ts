import { assertCurrentEnvironment } from "./lib/server-env";

export function register() {
  assertCurrentEnvironment();
}
