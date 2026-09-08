import { createFileRoute } from "@tanstack/react-router";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/format";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/offers")({
  component: OffersPage,
});

function OffersPage() {
  const { myOffers } = useLife();

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Offers"
        subtitle="Credit lines, retainers, and work offers sent to this account."
      />
      {myOffers.length === 0 ? (
        <EmptyState icon={Gift} text="No offers right now." />
      ) : (
        <div className="flex flex-col gap-3">
          {myOffers.map((o) => (
            <Card key={o.offer_id} className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <p className="font-medium">{o.title}</p>
                <p className="text-sm text-ink-muted">
                  {o.from} · {money(o.amount)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={o.status === "Active" ? "forest" : "amber"}>{o.status}</Badge>
                {o.status === "Open" ? (
                  <Button size="sm" onClick={() => toast.success("Offer accepted.")}>
                    Accept
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
