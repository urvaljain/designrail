import { GitHub, Google } from "arctic";

export type OAuthProvider = "google" | "github";

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function oauthAvailability(): { google: boolean; github: boolean } {
  return { google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) };
}

export function googleClient(): Google {
  return new Google(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!, `${appUrl()}/api/auth/google/callback`);
}

export function githubClient(): GitHub {
  return new GitHub(process.env.GITHUB_CLIENT_ID!, process.env.GITHUB_CLIENT_SECRET!, `${appUrl()}/api/auth/github/callback`);
}

export interface OAuthIdentity {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export async function fetchGoogleIdentity(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<OAuthIdentity | null> {
  const res = await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const u = (await res.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  if (!u.sub) return null;
  return { providerUserId: u.sub, email: u.email ?? null, emailVerified: u.email_verified === true, name: u.name ?? null };
}

export async function fetchGithubIdentity(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<OAuthIdentity | null> {
  const headers = { authorization: `Bearer ${accessToken}`, accept: "application/vnd.github+json", "user-agent": "Evident" };
  const res = await fetchImpl("https://api.github.com/user", { headers });
  if (!res.ok) return null;
  const u = (await res.json()) as { id?: number; name?: string | null; login?: string };
  if (!u.id) return null;
  // The profile email may be unverified or hidden; only a primary, verified address is trusted.
  const emailsRes = await fetchImpl("https://api.github.com/user/emails", { headers });
  const emails = emailsRes.ok ? ((await emailsRes.json()) as { email: string; primary: boolean; verified: boolean }[]) : [];
  const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) : undefined;
  return { providerUserId: String(u.id), email: primary?.email ?? null, emailVerified: Boolean(primary), name: u.name ?? u.login ?? null };
}
