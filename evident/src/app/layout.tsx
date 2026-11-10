import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Evident: a career platform that shows its evidence", template: "%s · Evident" },
  description: "Find verified jobs, see exactly how your resume matches each one, prepare a grounded application, track it, and practise the interview.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
