// Proper labels versus missing accessible names.
import { Input } from "@/components/ui/input";

export function Labels() {
  return (
    <form className="flex flex-col gap-sm">
      <Input id="name" label="Name" />
      <label className="flex gap-xs">
        <input type="checkbox" /> Remember me
      </label>
      <select aria-label="Country" />
      <select aria-describedby="plan-help" />
      <textarea placeholder="Comments" />
    </form>
  );
}
