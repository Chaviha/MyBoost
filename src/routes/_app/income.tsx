import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { formatDate, money } from "@/lib/format";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/income")({
  component: IncomePage,
});

function IncomePage() {
  const { myIncome } = useLife();
  const total = myIncome.reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Income"
        subtitle="Personal inflows this period — salary, drawings, and paid invoices."
      />
      <Card className="mb-4 p-5">
        <p className="text-xs font-medium tracking-[0.14em] text-ink-muted uppercase">Total</p>
        <p className="mt-1 font-display text-3xl font-medium tabular-nums">{money(total)}</p>
      </Card>
      {myIncome.length === 0 ? (
        <EmptyState icon={TrendingUp} text="No income recorded for this account." />
      ) : (
        <Card className="overflow-hidden p-0">
          {myIncome.map((row) => (
            <div
              key={row.income_id}
              className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0"
            >
              <div>
                <p className="font-medium">{row.source}</p>
                <p className="text-xs text-ink-muted">{formatDate(row.date)}</p>
              </div>
              <p className="text-sm font-medium tabular-nums">{money(row.amount)}</p>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
