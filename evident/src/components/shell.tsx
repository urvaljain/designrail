import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { NavLinks } from "./nav-links";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="display inline-flex items-center gap-2 text-xl font-semibold">
      <span aria-hidden="true" className="inline-block h-5 w-5 rounded-sm bg-mark ring-2 ring-accent" />
      Evident
    </Link>
  );
}

export function AppShell({ user, children }: { user: { email: string; name: string | null }; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col lg:flex-row">
      <header className="border-b border-line px-4 py-3 lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="flex items-center justify-between lg:block">
          <Wordmark href="/app" />
          <form action={logoutAction} className="lg:hidden">
            <button className="min-h-11 px-2 text-sm font-medium text-muted underline-offset-4 hover:underline">Sign out</button>
          </form>
        </div>
        <NavLinks />
        <div className="mt-8 hidden border-t border-line pt-4 text-sm lg:block">
          <p className="truncate font-medium" title={user.email}>
            {user.name ?? user.email}
          </p>
          <form action={logoutAction}>
            <button className="mt-1 min-h-11 text-muted underline-offset-4 hover:underline">Sign out</button>
          </form>
        </div>
      </header>
      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-10">
        {children}
      </main>
    </div>
  );
}

export function PublicShell({ children, signedIn }: { children: React.ReactNode; signedIn: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <Wordmark />
          <nav aria-label="Site" className="flex items-center gap-1 text-sm font-medium">
            <Link href="/pricing" className="inline-flex min-h-11 items-center rounded-control px-3 hover:bg-sunken">
              Pricing
            </Link>
            {signedIn ? (
              <Link href="/app" className="inline-flex min-h-11 items-center rounded-control bg-accent px-4 text-accent-fg hover:bg-accent-hover">
                Open app
              </Link>
            ) : (
              <>
                <Link href="/login" className="inline-flex min-h-11 items-center rounded-control px-3 hover:bg-sunken">
                  Sign in
                </Link>
                <Link href="/signup" className="inline-flex min-h-11 items-center rounded-control bg-accent px-4 text-accent-fg hover:bg-accent-hover">
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted">
          <p>Evident is a demonstration product. Listings marked “Demo data” are synthetic and describe fictional companies.</p>
        </div>
      </footer>
    </div>
  );
}
