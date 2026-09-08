import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { roleLabel } from "@/lib/roles";
import { useLife } from "@/lib/store";
import type { AccountLevel } from "@/lib/types";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
});

function UsersPage() {
  const { state, setUserLevel, can, currentUser } = useLife();

  if (!can("manage_users")) {
    return <AccessDenied need="User and role management is admin-only." />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Users & roles"
        subtitle="Promote or restrict access. Admin, owner, and employee each see a different workspace."
      />
      <Card className="overflow-hidden p-0">
        {state.users.map((user) => (
          <div
            key={user.user_id}
            className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-0 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {user.name}
                {user.user_id === currentUser.user_id ? (
                  <span className="ml-2 text-xs font-normal text-ink-faint">you</span>
                ) : null}
              </p>
              <p className="text-xs text-ink-muted">
                {user.email} · {user.role}
              </p>
            </div>
            <Badge
              tone={
                user.account_level === "admin"
                  ? "forest"
                  : user.account_level === "owner"
                    ? "amber"
                    : "neutral"
              }
            >
              {roleLabel(user.account_level)}
            </Badge>
            <Select
              className="sm:max-w-44"
              value={user.account_level}
              onChange={(e) => {
                const level = e.target.value as AccountLevel;
                setUserLevel(user.user_id, level);
                toast.success(`${user.name} is now ${roleLabel(level)}.`);
              }}
              aria-label={`Role for ${user.name}`}
            >
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
              <option value="user">Employee</option>
            </Select>
          </div>
        ))}
      </Card>
      <p className="mt-4 flex items-start gap-2 text-sm text-ink-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        Changing a role updates the sidebar immediately when you switch into that account.
      </p>
    </>
  );
}
