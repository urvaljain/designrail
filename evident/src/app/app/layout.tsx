import { AppShell } from "@/components/shell";
import { requireUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
