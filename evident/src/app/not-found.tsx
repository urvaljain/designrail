import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-4xl font-semibold">Page not found</h1>
      <p className="mt-3 text-muted">That page does not exist, or it is not yours to see.</p>
      <div className="mt-6 flex justify-center"><ButtonLink href="/app">Go to the app</ButtonLink></div>
    </main>
  );
}
