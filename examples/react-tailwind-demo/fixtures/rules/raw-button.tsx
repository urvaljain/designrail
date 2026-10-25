// Raw button versus registered Button.
import { Button } from "@/components/ui/button";

export function Actions() {
  return (
    <div className="flex gap-sm">
      <Button>Registered component: no finding.</Button>
      <button type="button">Raw element: DR004.</button>
    </div>
  );
}
