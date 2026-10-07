// Called at server startup and before reading server configuration. Values are never logged.
export function assertCurrentEnvironment(env: Readonly<Record<string, string | undefined>> = process.env): void {
  const prefix = "COURTLOAD_";
  const oldNames = Object.keys(env).filter(name => name.startsWith(prefix) || name.startsWith(`NEXT_PUBLIC_${prefix}`)).sort();
  if (oldNames.length) {
    throw new Error(`Legacy environment names: ${oldNames.map(name => `${name} -> ${name.replace(prefix, "COURTLENS_")}`).join(", ")}. Run scripts/migrate_env_names.py on your .env file.`);
  }
}
