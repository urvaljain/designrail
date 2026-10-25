// Simulated output from an AI coding tool for the request:
// "Add a billing panel to the settings page with the current plan, a coupon field, and an upgrade button."
// It works, but drifts from the design system. Copy it to src/features/billing/BillingPanel.tsx to try the repair loop.
import { useState } from "react";
import { Button } from "../../components/ui/button";

export function BillingPanel({ plan }: { plan: string }) {
  const [coupon, setCoupon] = useState("");

  return (
    <div className="rounded-md bg-white p-[18px] shadow-sm" style={{ marginTop: 24, borderColor: "#e2e8f0" }}>
      <img src="/card.svg" className="size-8" />
      <h2 className="text-lg font-semibold text-gray-900">Billing</h2>
      <p className={`text-sm text-[#64748b] ${plan === "pro" ? "font-bold" : ""}`}>Current plan: {plan}</p>
      <input
        type="text"
        placeholder="Coupon code"
        value={coupon}
        onChange={(event) => setCoupon(event.target.value)}
        className="mt-4 rounded-md border px-3 py-2"
      />
      <button className="bg-blue-600 px-4 py-2 text-white" onClick={() => alert(`Upgrading with ${coupon}`)}>
        Upgrade
      </button>
      <Button variant="secondary">Cancel</Button>
      <p style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>Prices include VAT.</p>
    </div>
  );
}
