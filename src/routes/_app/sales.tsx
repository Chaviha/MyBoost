import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Search, Wallet, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { MoreActions } from "@/components/more-actions";
import { Toolbar } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { MetricCard } from "@/components/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTime, money } from "@/lib/format";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/sales")({
  component: SalesPage,
});

function SalesPage() {
  const { selectedBusiness, businessSales, addSale, can, updateSale, deleteSale } = useLife();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  if (!can("manage_sales")) {
    return <AccessDenied need="Sales are only available to owners and admins." />;
  }
  if (!selectedBusiness) {
    return <EmptyState icon={Wallet} text="Add a business first." />;
  }

  const filtered = businessSales.filter((s) =>
    `${s.sale_id} ${s.customer_name} ${s.status}`.toLowerCase().includes(q.toLowerCase()),
  );
  const total = businessSales.reduce((sum, s) => sum + s.total, 0);

  return (
    <>
      <Toolbar
        title="Sales"
        subtitle={`Recorded sales for ${selectedBusiness.business_name}`}
        actionLabel="Record sale"
        onAction={() => setOpen(true)}
      />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <MetricCard title="Sales on record" value={money(total)} icon={Wallet} />
        <MetricCard title="Transactions" value={businessSales.length} icon={CreditCard} />
      </div>
      <div className="mb-3 flex h-11 items-center gap-2 rounded-md bg-paper px-3 shadow-border">
        <Search className="size-4 text-ink-faint" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search sales..."
          className="h-full border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>
      <Card className="overflow-hidden p-0">
        <div className="hidden grid-cols-[1.1fr_1fr_1fr_1fr_auto] gap-3 border-b border-line px-4 py-3 text-[11px] font-medium tracking-wide text-ink-faint uppercase md:grid">
          <span>Sale</span>
          <span>Customer</span>
          <span>Date</span>
          <span>Total</span>
          <span>Status</span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={Wallet} text="No sales match your search." compact />
        ) : (
          filtered.map((sale) => (
            <div
              key={sale.sale_id}
              className="grid gap-1 border-b border-line px-4 py-3 last:border-0 md:grid-cols-[1.1fr_1fr_1fr_1fr_auto] md:items-center md:gap-3"
            >
              <span className="font-mono text-xs text-ink-muted">{sale.sale_id}</span>
              <span className="text-sm">{sale.customer_name || "Walk-in"}</span>
              <span className="text-sm text-ink-muted">{formatDateTime(sale.date)}</span>
              <strong className="text-sm tabular-nums">{money(sale.total)}</strong>
              <Badge tone={sale.status.toLowerCase() === "completed" ? "forest" : "amber"}>
                {sale.status}
              </Badge>
              <MoreActions actions={[
                { label: "Edit", icon: <Pencil className="size-4" />, onSelect: () => {
                  const customer_name = window.prompt("Customer", sale.customer_name || "Walk-in");
                  if (customer_name === null) return;
                  const totalText = window.prompt("Total", String(sale.total));
                  if (totalText === null) return;
                  updateSale(sale.sale_id, { customer_name, total: Number(totalText) || 0, subtotal: Number(totalText) || 0 });
                  toast.success("Sale updated.");
                } },
                { label: "Delete", destructive: true, icon: <Trash2 className="size-4" />, onSelect: () => {
                  if (window.confirm(`Delete sale ${sale.sale_id}?`)) { deleteSale(sale.sale_id); toast.success("Sale deleted."); }
                } },
              ]} />
            </div>
          ))
        )}
      </Card>

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record sale</DialogTitle>
          </DialogHeader>
          <SaleForm
            onCancel={() => setOpen(false)}
            onSubmit={(form) => {
              addSale(form);
              toast.success("Sale recorded.");
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function SaleForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (form: { customer: string; total: string; status: string }) => void;
}) {
  const [form, setForm] = useState({ customer: "", total: "", status: "Completed" });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.total) return;
        onSubmit(form);
      }}
    >
      <Field label="Customer">
        <Input
          value={form.customer}
          onChange={(e) => setForm({ ...form, customer: e.target.value })}
          placeholder="Walk-in"
        />
      </Field>
      <Field label="Total (KSh)">
        <Input
          required
          type="number"
          min={0}
          value={form.total}
          onChange={(e) => setForm({ ...form, total: e.target.value })}
        />
      </Field>
      <Field label="Status">
        <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option>Completed</option>
          <option>Invoiced</option>
        </Select>
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Record sale</Button>
      </div>
    </form>
  );
}
