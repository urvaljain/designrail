"use client";

import { Button } from "@/components/ui";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-muted">This page could not be loaded. Your data has not been changed.</p>
      <div className="mt-6 flex justify-center"><Button onClick={reset}>Try again</Button></div>
    </div>
  );
}
