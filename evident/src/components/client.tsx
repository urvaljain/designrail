"use client";

import { useState, type ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./ui";

/** Submit button that reports progress to sighted and screen-reader users while its form is pending. */
export function SubmitButton({ children, pendingLabel = "Working…", ...props }: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" aria-disabled={pending} onClick={(e) => pending && e.preventDefault()} {...props}>
      <span aria-live="polite">{pending ? pendingLabel : children}</span>
    </Button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}
