// Dynamic classes that cannot be fully resolved.
import { cn } from "@/lib/cn";

const styles = { panel: "bg-surface" };

export function Dynamic({ tone, active }: { tone: string; active: boolean }) {
  return (
    <div className={cn("p-md", active && "bg-brand", `text-${tone}`, styles.panel)}>
      Static parts are checked; `text-${"{tone}"}` and styles.panel are reported as not analyzed.
    </div>
  );
}
