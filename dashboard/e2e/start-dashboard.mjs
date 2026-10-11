// Screenshot baselines use production output, including the standalone server's static assets.
import { cpSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const standalone = resolve(".next/standalone");
cpSync(resolve("public"), resolve(standalone, "public"), { recursive: true });
cpSync(resolve(".next/static"), resolve(standalone, ".next/static"), { recursive: true });
await import(pathToFileURL(resolve(standalone, "server.js")).href);
