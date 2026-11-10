import { generateCodeVerifier, generateState } from "arctic";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { githubClient, googleClient, oauthAvailability } from "@/lib/auth/oauth";

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 };

/** Start an OAuth sign-in: authorization-code flow with state, plus PKCE where the provider supports it. */
export async function GET(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const available = oauthAvailability();
  const jar = await cookies();
  const state = generateState();
  jar.set("oauth_state", state, cookieOpts);
  if (provider === "google" && available.google) {
    const verifier = generateCodeVerifier();
    jar.set("oauth_verifier", verifier, cookieOpts);
    return NextResponse.redirect(googleClient().createAuthorizationURL(state, verifier, ["openid", "email", "profile"]));
  }
  if (provider === "github" && available.github) {
    return NextResponse.redirect(githubClient().createAuthorizationURL(state, ["read:user", "user:email"]));
  }
  return NextResponse.json({ error: "This sign-in method is not configured." }, { status: 404 });
}
