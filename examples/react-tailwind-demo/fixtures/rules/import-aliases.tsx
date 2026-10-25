// Component import aliases: the registered specifier, an alias name, and a relative path.
import { Button as PrimaryButton } from "@/components/ui/button";
import { Card } from "../components/ui/card";

export function Imports() {
  return (
    <Card title="Imports">
      <PrimaryButton>Aliased local name, registered specifier: no finding.</PrimaryButton>
    </Card>
  );
}
