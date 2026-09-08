import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { workspaceLabel } from "@/lib/roles";
import { useLife } from "@/lib/store";

export function AccessDenied({ need }: { need: string }) {
  const { currentUser, state } = useLife();
  const label = workspaceLabel(currentUser, state.relationships);

  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-leaf text-forest">
        <ShieldAlert className="size-5" />
      </div>
      <h1 className="font-display text-2xl font-medium tracking-tight">This view is locked</h1>
      <p className="mt-2 text-sm text-ink-muted text-pretty">
        You are signed in as {currentUser.name} ({label}). {need}
      </p>

    </Card>
  );
}
