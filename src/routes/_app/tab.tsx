import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, ListChecks, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { JobCard } from "@/components/job-card";
import { PageHeader } from "@/components/page-header";
import { ChargeDialog, LedgerList, PaymentDialog } from "@/components/tab-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, money } from "@/lib/format";
import { chargeModeLabel } from "@/lib/roles";
import { useLife } from "@/lib/store";
import type { Customer, Quotation } from "@/lib/types";

export const Route = createFileRoute("/_app/tab")({
  component: TabPage,
});

function quoteTone(status: string): "forest" | "amber" | "neutral" | "red" {
  if (status === "Accepted") return "forest";
  if (status === "Rejected") return "red";
  if (status === "Sent" || status === "Pending" || status === "Open") return "amber";
  return "neutral";
}

function TabPage() {
  const {
    myTabs,
    state,
    addCustomerCharge,
    recordCustomerPayment,
    ledgerFor,
    canCharge,
    canPay,
    workspace,
    myCustomerJobs,
    myCustomerSales,
    myCustomerQuotes,
    acceptQuotation,
    rejectQuotation,
  } = useLife();
  const [chargeFor, setChargeFor] = useState<Customer | null>(null);
  const [payFor, setPayFor] = useState<Customer | null>(null);
  const [busyQuote, setBusyQuote] = useState<string | null>(null);

  const productsFor = (customer: Customer) =>
    state.products.filter((p) => p.business_id === customer.business_id && p.status === "active");

  const shopName = (id: string) =>
    state.businesses.find((b) => b.business_id === id)?.business_name ?? "Business";

  async function respondQuote(q: Quotation, decision: "accept" | "reject") {
    setBusyQuote(q.quote_id);
    try {
      if (q.share_token) {
        const res = await fetch(`/api/public/quote/${encodeURIComponent(q.share_token)}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not update quotation.");
      }
      // Keep local copy in sync for notifications / list.
      if (decision === "accept") acceptQuotation(q.quote_id);
      else rejectQuotation(q.quote_id);
      toast.success(decision === "accept" ? "Quotation accepted." : "Quotation declined.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update quotation.");
    } finally {
      setBusyQuote(null);
    }
  }

  const openQuotes = (myCustomerQuotes || []).filter(
    (q) => q.status === "Sent" || q.status === "Pending" || q.status === "Open" || q.status === "Received",
  );

  return (
    <>
      <PageHeader
        eyebrow={workspace === "customer" ? "Your shops" : "Tabs"}
        title="My tab"
        subtitle="Orders, quotations, jobs and payments at the shops that added you as a customer."
      />
      {myTabs.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          text="You are not a customer at any business yet. An owner can add you and allow you to post charges."
        />
      ) : (
        <Tabs defaultValue={openQuotes.length ? "quotes" : "payments"}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="quotes">
              Quotes{openQuotes.length ? ` (${openQuotes.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="quotes">
            {(myCustomerQuotes || []).length === 0 ? (
              <EmptyState
                icon={ListChecks}
                text="No quotations received yet. When a business sends you a quote, it appears here."
                compact
              />
            ) : (
              <div className="flex flex-col gap-3">
                {(myCustomerQuotes || []).map((q) => {
                  const open =
                    q.status === "Sent" ||
                    q.status === "Pending" ||
                    q.status === "Open" ||
                    q.status === "Received";
                  return (
                    <Card key={q.quote_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="text-xs font-medium tracking-wide text-forest uppercase">
                          {shopName(q.business_id)}
                        </p>
                        <p className="mt-0.5 font-medium text-ink">
                          Quotation · {money(q.total)}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {formatDateTime(q.date)}
                          {q.notes ? ` · ${q.notes.slice(0, 80)}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={quoteTone(q.status)}>{q.status}</Badge>
                        {open ? (
                          <>
                            <Button
                              size="sm"
                              disabled={busyQuote === q.quote_id}
                              onClick={() => void respondQuote(q, "accept")}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busyQuote === q.quote_id}
                              onClick={() => void respondQuote(q, "reject")}
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
          </TabsContent>

          <TabsContent value="orders">
            {myCustomerSales.length === 0 ? (
              <EmptyState icon={ShoppingCart} text="No orders on your tabs yet." compact />
            ) : (
              <Card className="overflow-hidden p-0">
                {myCustomerSales.map((sale) => (
                  <div
                    key={sale.sale_id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{sale.customer_name}</p>
                      <p className="text-xs text-ink-muted">{formatDateTime(sale.date)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium tabular-nums">{money(sale.total)}</p>
                      <Badge tone={sale.status === "Completed" ? "forest" : "amber"}>
                        {sale.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </TabsContent>

          <TabsContent value="jobs">
            {myCustomerJobs.length === 0 ? (
              <EmptyState icon={ClipboardList} text="No jobs assigned for your orders yet." compact />
            ) : (
              <div className="flex flex-col gap-3">
                {myCustomerJobs.map((job) => (
                  <JobCard
                    key={job.job_id}
                    job={job}
                    shop={shopName(job.business_id)}
                    overdue={+new Date(job.due_date) < +new Date("2026-08-31")}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="payments">
            <div className="flex flex-col gap-4">
              {myTabs.map((customer) => {
                const shop = state.businesses.find((b) => b.business_id === customer.business_id);
                return (
                  <Card key={customer.customer_id} className="overflow-hidden p-0">
                    {shop?.image_url ? (
                      <img
                        src={shop.image_url}
                        alt=""
                        className="h-28 w-full object-cover"
                      />
                    ) : null}
                    <div className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">
                            {shop?.business_name ?? "Business"}
                          </p>
                          <h2 className="mt-1 font-display text-xl font-medium tracking-tight">
                            {customer.name}
                          </h2>
                        </div>
                        <Badge>{chargeModeLabel(customer.charge_mode)}</Badge>
                      </div>
                      <p className="mt-3 font-display text-3xl font-medium tabular-nums">
                        {money(customer.amount)}
                      </p>
                      <p className="text-sm text-ink-muted">Amount you owe</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {canCharge(customer) ? (
                          <Button size="sm" onClick={() => setChargeFor(customer)}>
                            I took stock
                          </Button>
                        ) : (
                          <p className="text-sm text-ink-muted">
                            Only the owner can add charges on this tab.
                          </p>
                        )}
                        {canPay(customer) && customer.amount > 0 ? (
                          <Button size="sm" variant="secondary" onClick={() => setPayFor(customer)}>
                            I paid
                          </Button>
                        ) : null}
                      </div>
                      <div className="mt-4">
                        <LedgerList entries={ledgerFor(customer.customer_id)} />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      )}

      <ChargeDialog
        customer={chargeFor}
        products={chargeFor ? productsFor(chargeFor) : []}
        onClose={() => setChargeFor(null)}
        onSubmit={(payload) => {
          if (!chargeFor) return;
          addCustomerCharge(chargeFor.customer_id, payload);
          toast.success("Charge added to your tab.");
          setChargeFor(null);
        }}
      />
      <PaymentDialog
        customer={payFor}
        onClose={() => setPayFor(null)}
        onSubmit={(amount, note) => {
          if (!payFor) return;
          recordCustomerPayment(payFor.customer_id, amount, note);
          toast.success("Payment recorded.");
          setPayFor(null);
        }}
      />
    </>
  );
}
