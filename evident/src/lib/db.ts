import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient({ log: process.env.PRISMA_LOG ? ["query", "warn", "error"] : ["warn", "error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** Prisma's Json input type is stricter than our domain types; this is the single cast point. */
export function json<T>(value: T): never {
  return JSON.parse(JSON.stringify(value)) as never;
}
