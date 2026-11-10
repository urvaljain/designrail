import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signupAction } from "@/app/actions";
import { AuthForm } from "@/components/auth-form";
import { oauthAvailability } from "@/lib/auth/oauth";
import { getUser } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Create account" };

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  if (await getUser()) redirect("/app");
  const { error, notice } = await searchParams;
  return <AuthForm mode="signup" action={signupAction} error={error} notice={notice} oauth={oauthAvailability()} />;
}
