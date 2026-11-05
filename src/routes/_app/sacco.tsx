import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PiggyBank } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SearchFilter } from "@/components/search-filter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/format";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/sacco")({
  component: SaccoPage,
});

function SaccoPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { mySaccos } = useLife();

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Sacco"
        subtitle="Savings and monthly contributions tied to this account."
      />
      <SearchFilter onSearch={setSearchQuery} placeholder="Search saccos…" />
      {mySaccos.length === 0 ? (
        <EmptyState icon={PiggyBank} text="No sacco linked yet." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {mySaccos
            .filter((s) => {
              const q = searchQuery.trim().toLowerCase();
              if (!q) return true;
              return `${s.name} ${s.sacco_id ?? ""}`.toLowerCase().includes(q);
            })
            .map((s) => (
            <Card key={s.sacco_id} className="p-5">
              <p className="text-xs font-medium tracking-wide text-forest uppercase">{s.name}</p>
              <p className="mt-2 font-display text-3xl font-medium tabular-nums">{money(s.balance)}</p>
              <p className="text-sm text-ink-muted">
                Monthly contribution {money(s.contribution)}
              </p>
              <Button
                size="sm"
                className="mt-4"
                variant="secondary"
                onClick={() => toast.success(`Contribution of ${money(s.contribution)} noted.`)}
              >
                Contribute
              </Button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
