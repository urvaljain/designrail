import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function App() {
  const [saved, setSaved] = useState(false);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-lg px-md py-xl">
      <header className="flex items-center gap-md">
        <img src="/avatar.png" alt="Profile photo of the signed-in user" className="size-12 rounded-full" />
        <div>
          <h1 className="text-2xl font-semibold text-text">Account settings</h1>
          <p className="text-sm text-text-muted">Manage your profile and notifications.</p>
        </div>
      </header>

      <Card title="Profile" description="Shown to other members of your workspace.">
        <Input id="display-name" label="Display name" defaultValue="Ada" />
        <Input id="email" label="Email" type="email" hint="We never share your email." />
      </Card>

      <Card title="Notifications">
        <label className="flex items-center gap-sm text-text">
          <input type="checkbox" defaultChecked />
          Product updates
        </label>
        <label className="flex items-center gap-sm text-text">
          <input type="checkbox" />
          Weekly summary
        </label>
      </Card>

      <div className="flex justify-end gap-sm">
        <Button variant="secondary">Cancel</Button>
        <Button onClick={() => setSaved(true)}>Save changes</Button>
      </div>
      {saved ? (
        <p role="status" className="text-sm text-success">
          Settings saved.
        </p>
      ) : null}
    </main>
  );
}
