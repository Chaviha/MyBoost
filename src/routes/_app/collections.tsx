import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, MessageSquare, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, money } from "@/lib/format";
import type { CustomerStatus } from "@/lib/types";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/collections")({
  component: CollectionsPage,
});

function toneFor(status: CustomerStatus) {
  if (status === "Overdue") return "red" as const;
  if (status === "Due soon") return "amber" as const;
  if (status === "Paid") return "forest" as const;
  return "neutral" as const;
}

function CollectionsPage() {
  const { allCustomers, visibleBusinesses, totalOutstanding, totalOverdue, can } = useLife();

  if (!can("view_collections")) {
    return <AccessDenied need="Smart collections are for owners and admins." />;
  }

  const nameOf = (id: string) =>
    visibleBusinesses.find((b) => b.business_id === id)?.business_name ?? "—";

  const steps = [
    "Invoice created",
    "Reminder before due date",
    "Reminder on due date",
    "Overdue follow-up",
    "Payment recorded",
  ];

  return (
    <>
      <PageHeader
        title="Smart collections"
        subtitle="LifeBoost follows up with customers so you don't have to."
      />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard title="Total outstanding" value={money(totalOutstanding)} icon={Wallet} />
        <MetricCard title="Overdue" value={money(totalOverdue)} icon={AlertTriangle} tone="red" />
        <MetricCard title="Customers tracked" value={allCustomers.length} icon={Users} />
      </div>
      <Card className="mb-4 p-5">
        <p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">
          Automatic reminders
        </p>
        <h2 className="mt-1 font-display text-xl font-medium tracking-tight">
          Collect while you run the business.
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Customers get SMS, WhatsApp or email reminders — even without a LifeBoost account.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {steps.map((step, i) => (
            <div key={step} className="flex items-start gap-2 rounded-md bg-canvas px-3 py-2 text-xs">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-leaf text-[10px] font-medium text-forest">
                {i + 1}
              </span>
              {step}
            </div>
          ))}
        </div>
      </Card>
      <Card className="overflow-hidden p-0">
        {allCustomers.length === 0 ? (
          <EmptyState icon={Users} text="No customers to track yet." compact />
        ) : (
          allCustomers.map((customer) => (
            <div
              key={customer.customer_id}
              className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{customer.name}</p>
                <p className="text-xs text-ink-muted">{customer.phone}</p>
              </div>
              <span className="text-sm text-ink-muted">{nameOf(customer.business_id)}</span>
              <strong className="text-sm tabular-nums">{money(customer.amount)}</strong>
              <Badge tone={toneFor(customer.status)}>{customer.status}</Badge>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  toast.success(
                    `Reminder sent to ${customer.name} · ${money(customer.amount)} due ${formatDate(customer.due_date)}.`,
                  )
                }
              >
                <MessageSquare className="size-3.5" />
                Send
              </Button>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
