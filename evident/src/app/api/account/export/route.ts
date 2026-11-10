import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/server";
import { exportUserData } from "@/lib/services/applications";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const data = await exportUserData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="evident-export.json"', "cache-control": "no-store" } });
}
