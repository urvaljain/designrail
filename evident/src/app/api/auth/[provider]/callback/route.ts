import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { upsertOAuthUser } from "@/lib/auth/core";
import { fetchGithubIdentity, fetchGoogleIdentity, githubClient, googleClient, oauthAvailability } from "@/lib/auth/oauth";
import { startSession } from "@/lib/auth/server";

const fail = (req: Request, message: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, process.env.APP_URL ?? req.url));

function sameState(a: string | undefined, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("oauth_state")?.value;
  const verifier = jar.get("oauth_verifier")?.value;
  jar.delete("oauth_state");
  jar.delete("oauth_verifier");
  const code = url.searchParams.get("code");
  if (!code || !sameState(expected, url.searchParams.get("state"))) return fail(req, "Sign-in could not be verified. Please try again.");

  const available = oauthAvailability();
  try {
    let identity = null;
    if (provider === "google" && available.google && verifier) {
      const tokens = await googleClient().validateAuthorizationCode(code, verifier);
      identity = await fetchGoogleIdentity(tokens.accessToken());
    } else if (provider === "github" && available.github) {
      const tokens = await githubClient().validateAuthorizationCode(code);
      identity = await fetchGithubIdentity(tokens.accessToken());
    } else {
      return fail(req, "This sign-in method is not configured.");
    }
    if (!identity) return fail(req, "The provider did not return your account details.");
    const result = await upsertOAuthUser(provider, identity.providerUserId, identity.email, identity.emailVerified, identity.name);
    if (!result.ok) return fail(req, result.error);
    await startSession(result.userId);
    return NextResponse.redirect(new URL("/app", process.env.APP_URL ?? req.url));
  } catch {
    return fail(req, "Sign-in with that provider failed. Please try again.");
  }
}
