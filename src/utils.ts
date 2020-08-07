import { createHash } from "crypto";

export const hash = (data: string): string =>
  createHash("sha256").update(data).digest("hex").slice(0, 8);

export const joinCode = (code: string[]): string => `${code.join("\n")}\n`;
