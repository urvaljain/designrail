import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createSession, resolveSession, revokeSession, SESSION_COOKIE } from "./core";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  plan: string;
}

export const getUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  return resolveSession(jar.get(SESSION_COOKIE)?.value);
});

/** Every authenticated page and action starts here. The returned id is the only user id code may trust. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function startSession(userId: string): Promise<void> {
  const { token, expiresAt } = await createSession(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  await revokeSession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}

export async function clientKey(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim().slice(0, 64);
}

/** CSRF defence for route handlers (Server Actions get the same check from Next.js itself). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.method === "GET" || request.method === "HEAD";
  const allowed = new Set<string>();
  if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  return allowed.has(origin);
}
