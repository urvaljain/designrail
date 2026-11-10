import { PublicShell } from "@/components/shell";
import { getUser } from "@/lib/auth/server";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return <PublicShell signedIn={Boolean(user)}>{children}</PublicShell>;
}
