import Link from "next/link";
import { SubmitButton } from "./client";
import { Card, Field, FlashMessages, Input } from "./ui";

export function AuthForm({ mode, action, error, notice, oauth }: { mode: "login" | "signup"; action: (fd: FormData) => Promise<void>; error?: string; notice?: string; oauth: { google: boolean; github: boolean } }) {
  const signup = mode === "signup";
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-semibold">{signup ? "Create your account" : "Sign in"}</h1>
      <p className="mt-2 text-muted">{signup ? "Free. No card needed." : "Welcome back."}</p>
      <Card className="mt-6">
        <FlashMessages error={error} notice={notice} />
        <form action={action} className="space-y-4">
          {signup ? (
            <Field label="Name (optional)" htmlFor="name">
              <Input id="name" name="name" autoComplete="name" maxLength={80} />
            </Field>
          ) : null}
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
          </Field>
          <Field label="Password" htmlFor="password" hint={signup ? "At least 10 characters." : undefined}>
            <Input id="password" name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 10 : 1} maxLength={200} aria-describedby={signup ? "password-hint" : undefined} />
          </Field>
          <SubmitButton className="w-full" pendingLabel={signup ? "Creating account…" : "Signing in…"}>
            {signup ? "Create account" : "Sign in"}
          </SubmitButton>
        </form>
        {oauth.google || oauth.github ? (
          <div className="mt-5 space-y-2 border-t border-line pt-5">
            {oauth.google ? (
              <a href="/api/auth/google" className="flex min-h-11 items-center justify-center rounded-control border border-line-strong px-4 text-sm font-semibold hover:bg-sunken">
                Continue with Google
              </a>
            ) : null}
            {oauth.github ? (
              <a href="/api/auth/github" className="flex min-h-11 items-center justify-center rounded-control border border-line-strong px-4 text-sm font-semibold hover:bg-sunken">
                Continue with GitHub
              </a>
            ) : null}
          </div>
        ) : null}
      </Card>
      <p className="mt-4 text-sm">
        {signup ? "Already have an account? " : "New to Evident? "}
        <Link href={signup ? "/login" : "/signup"} className="font-semibold text-accent-ink underline underline-offset-4">
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
