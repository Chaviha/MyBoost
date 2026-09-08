import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, ShoppingCart } from "lucide-react";
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
import type { Customer } from "@/lib/types";

export const Route = createFileRoute("/_app/tab")({
  component: TabPage,
});

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
  } = useLife();
  const [chargeFor, setChargeFor] = useState<Customer | null>(null);
  const [payFor, setPayFor] = useState<Customer | null>(null);

  const productsFor = (customer: Customer) =>
    state.products.filter((p) => p.business_id === customer.business_id && p.status === "active");

  const shopName = (id: string) =>
    state.businesses.find((b) => b.business_id === id)?.business_name ?? "Business";

  return (
    <>
      <PageHeader
        eyebrow={workspace === "customer" ? "Your shops" : "Tabs"}
        title="My tab"
        subtitle="Orders, jobs and payments at the shops that added you as a customer."
      />
      {myTabs.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          text="You are not a customer at any business yet. An owner can add you and allow you to post charges."
        />
      ) : (
        <Tabs defaultValue="payments">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>

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
        open={Boolean(chargeFor)}
        onClose={() => setChargeFor(null)}
        onSubmit={(form) => {
          addCustomerCharge(form);
          toast.success("Added to your tab.");
        }}
      />
      <PaymentDialog
        customer={payFor}
        open={Boolean(payFor)}
        onClose={() => setPayFor(null)}
        onSubmit={(form) => {
          recordCustomerPayment(form);
          toast.success("Payment noted.");
        }}
      />
    </>
  );
}
