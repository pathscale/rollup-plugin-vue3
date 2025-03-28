import path from "node:path";
import { createHash } from "node:crypto";

export const hash = (data: string): string =>
  createHash("sha256").update(data).digest("hex").slice(0, 8);

export const joinCode = (code: string[]): string => `${code.join("\n")}\n`;

export function normalizePath(...paths: string[]): string {
  const f = path.join(...paths).replaceAll("\\", "/");
  if (/^\.[/\\]/.test(paths[0])) return `./${f}`;
  return f;
}
