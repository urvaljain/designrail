import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { sha256 } from "../text";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const salt = Buffer.from(parts[4]!, "base64");
  const expected = Buffer.from(parts[5]!, "base64");
  if (!Number.isInteger(n) || n < 1024 || n > 2 ** 20 || expected.length !== KEYLEN) return false;
  const actual = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: 128 * n * r * 2 });
  return timingSafeEqual(actual, expected);
}

// Verified against when the email is unknown, so "no such user" and "wrong password" take the same time.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password-placeholder"));

export const SESSION_DAYS = 30;
export const SESSION_COOKIE = "evident_session";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return "Enter a valid email address.";
  if (password.length < 10) return "Use a password of at least 10 characters.";
  if (password.length > 200) return "That password is too long.";
  return null;
}

export type AuthResult = { ok: true; userId: string } | { ok: false; error: string };

export async function signUp(emailRaw: string, password: string, name: string | null): Promise<AuthResult> {
  const email = normalizeEmail(emailRaw);
  const problem = validateCredentials(email, password);
  if (problem) return { ok: false, error: problem };
  const passwordHash = await hashPassword(password);
  try {
    const user = await db.user.create({ data: { email, passwordHash, name: name?.trim().slice(0, 80) || null, profile: { create: {} } }, select: { id: true } });
    return { ok: true, userId: user.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Deliberately the same wording as a generic failure would be too hostile for sign-up; the
      // rate limiter is what bounds enumeration here.
      return { ok: false, error: "An account with this email already exists. Sign in instead." };
    }
    throw err;
  }
}

export async function logIn(emailRaw: string, password: string): Promise<AuthResult> {
  const email = normalizeEmail(emailRaw);
  const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !user.passwordHash || !ok) return { ok: false, error: "That email and password do not match." };
  return { ok: true, userId: user.id };
}

/** Returns the raw token for the cookie. Only its hash is stored, so a database leak cannot be replayed. */
export async function createSession(userId: string, now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { id: sha256(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function resolveSession(token: string | undefined, now: Date = new Date()): Promise<{ id: string; email: string; name: string | null; plan: string } | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const session = await db.session.findUnique({ where: { id: sha256(token) }, include: { user: { select: { id: true, email: true, name: true, plan: true } } } });
  if (!session) return null;
  if (session.expiresAt.getTime() <= now.getTime()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.session.deleteMany({ where: { id: sha256(token) } });
}

/**
 * Fixed-window rate limit in PostgreSQL, so it holds across app instances.
 * Returns true when the caller is within the limit.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number, now: Date = new Date()): Promise<boolean> {
  const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const rows = await db.$queryRaw<{ count: number }[]>(Prisma.sql`
    INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"`);
  return (rows[0]?.count ?? 1) <= limit;
}

/** Link an OAuth identity to a user. An existing account is only matched on a provider-verified email. */
export async function upsertOAuthUser(provider: string, providerUserId: string, email: string | null, emailVerified: boolean, name: string | null): Promise<AuthResult> {
  const existing = await db.oAuthAccount.findUnique({ where: { provider_providerUserId: { provider, providerUserId } }, select: { userId: true } });
  if (existing) return { ok: true, userId: existing.userId };
  if (!email || !emailVerified) return { ok: false, error: "Your account with that provider has no verified email address." };
  const normalized = normalizeEmail(email);
  const user = await db.user.upsert({
    where: { email: normalized },
    update: {},
    create: { email: normalized, name: name?.slice(0, 80) ?? null, profile: { create: {} } },
    select: { id: true },
  });
  await db.oAuthAccount.create({ data: { provider, providerUserId, userId: user.id } });
  return { ok: true, userId: user.id };
}
