import { createHash } from "node:crypto";

export function normalizeWhitespace(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[  -  ]/g, " ")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitLines(s: string): string[] {
  return normalizeWhitespace(s)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function words(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9][a-z0-9+#.'-]*/g) ?? [];
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
