import { createFileRoute } from "@tanstack/react-router";
import { Briefcase, Gift, Users } from "lucide-react";
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

function offerIcon(kind?: string) {
  if (kind === "employment") return Briefcase;
  if (kind === "customer") return Users;
  return Gift;
}

function offerTone(status: string) {
  if (status === "Accepted") return "forest" as const;
  if (status === "Declined") return "red" as const;
  return "amber" as const;
}

function OffersPage() {
  const { myOffers, acceptOffer, declineOffer } = useLife();

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Offers"
        subtitle="Employment invites, customer tabs, and work offers sent to this account."
      />
      {myOffers.length === 0 ? (
        <EmptyState icon={Gift} text="No offers right now." />
      ) : (
        <div className="flex flex-col gap-3">
          {myOffers.map((o) => {
            const Icon = offerIcon(o.kind);
            return (
              <Card key={o.offer_id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="flex items-center gap-3">
                  <Icon className="size-5 shrink-0 text-ink-faint" />
                  <div>
                    <p className="font-medium">{o.title}</p>
                    <p className="text-sm text-ink-muted">
                      {o.from}
                      {o.amount > 0 ? ` · ${money(o.amount)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={offerTone(o.status)}>{o.status}</Badge>
                  {o.status === "Open" ? (
                    <>
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await acceptOffer(o.offer_id);
                            toast.success(o.kind === "customer" ? "Customer tab added." : o.kind === "employment" ? "Professional workspace added." : "Offer accepted.");
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Unable to accept offer.");
                          }
                        }}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await declineOffer(o.offer_id);
                            toast.success("Offer declined.");
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Unable to decline offer.");
                          }
                        }}
                      >
                        Decline
                      </Button>
                    </>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}