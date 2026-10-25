// Corrected version of fixtures/ai-output/BillingPanel.tsx, following the DesignRail repair prompt.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function BillingPanel({ plan }: { plan: string }) {
  const [coupon, setCoupon] = useState("");

  return (
    <Card title="Billing" description={`Current plan: ${plan}`}>
      <img src="/card.svg" alt="" className="size-8" />
      <p className={plan === "pro" ? "text-sm font-bold text-text-muted" : "text-sm text-text-muted"}>
        Prices include VAT.
      </p>
      <Input id="coupon" label="Coupon code" value={coupon} onChange={(event) => setCoupon(event.target.value)} />
      <div className="flex justify-end gap-sm">
        <Button variant="secondary">Cancel</Button>
        <Button onClick={() => alert(`Upgrading with ${coupon}`)}>Upgrade</Button>
      </div>
    </Card>
  );
}
