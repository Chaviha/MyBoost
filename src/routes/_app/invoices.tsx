import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { Toolbar } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
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
import { formatDate, money } from "@/lib/format";
import { useLife } from "@/lib/store";
import type { Invoice } from "@/lib/types";

export const Route = createFileRoute("/_app/invoices")({
  component: InvoicesPage,
});

function InvoicesPage() {
  const { selectedBusiness, businessInvoices, businessCustomers, addInvoice, recordInvoicePayment, can } =
    useLife();
  const [open, setOpen] = useState(false);
  const [pay, setPay] = useState<Invoice | null>(null);

  if (!can("manage_quotes")) {
    return <AccessDenied need="Invoices are for business owners." />;
  }
  if (!selectedBusiness) return <EmptyState icon={CreditCard} text="Add a business first." />;

  return (
    <>
      <Toolbar
        title="Invoices"
        subtitle={`Bills issued by ${selectedBusiness.business_name}`}
        actionLabel="Create invoice"
        onAction={() => setOpen(true)}
      />
      {businessInvoices.length === 0 ? (
        <EmptyState icon={CreditCard} text="No invoices yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {businessInvoices.map((inv) => (
            <Card key={inv.invoice_id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{inv.customer_name}</p>
                  <p className="text-xs text-ink-muted">
                    {inv.invoice_id} · due {formatDate(inv.due_date)}
                  </p>
                </div>
                <Badge
                  tone={inv.status === "Paid" ? "forest" : inv.status === "Partial" ? "amber" : "red"}
                >
                  {inv.status}
                </Badge>
              </div>
              <p className="mt-2 font-display text-2xl font-medium tabular-nums">{money(inv.total)}</p>
              <p className="text-xs text-ink-muted">Paid {money(inv.paid)}</p>
              {inv.status !== "Paid" ? (
                <Button size="sm" className="mt-3" onClick={() => setPay(inv)}>
                  Record payment
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create invoice</DialogTitle>
          </DialogHeader>
          <InvoiceForm
            customers={businessCustomers}
            onCancel={() => setOpen(false)}
            onSubmit={(form) => {
              addInvoice(form);
              toast.success("Invoice created.");
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(pay)} onOpenChange={(v) => !v && setPay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          {pay ? (
            <PayForm
              due={pay.total - pay.paid}
              onCancel={() => setPay(null)}
              onSubmit={(amount) => {
                recordInvoicePayment(pay.invoice_id, amount);
                toast.success("Payment recorded.");
                setPay(null);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function InvoiceForm({
  customers,
  onCancel,
  onSubmit,
}: {
  customers: { customer_id: string; name: string }[];
  onCancel: () => void;
  onSubmit: (form: { customerId: string; total: string; due: string }) => void;
}) {
  const [form, setForm] = useState({ customerId: "", total: "", due: "" });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.customerId || !form.total || !form.due) return;
        onSubmit(form);
      }}
    >
      <Field label="Customer">
        <Select
          required
          value={form.customerId}
          onChange={(e) => setForm({ ...form, customerId: e.target.value })}
        >
          <option value="">Select…</option>
          {customers.map((c) => (
            <option key={c.customer_id} value={c.customer_id}>
              {c.name}
            </option>
          ))}
        </Select>
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
      <Field label="Due date">
        <Input
          required
          type="date"
          value={form.due}
          onChange={(e) => setForm({ ...form, due: e.target.value })}
        />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Create</Button>
      </div>
    </form>
  );
}

function PayForm({
  due,
  onCancel,
  onSubmit,
}: {
  due: number;
  onCancel: () => void;
  onSubmit: (amount: string) => void;
}) {
  const [amount, setAmount] = useState(String(due));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(amount);
      }}
    >
      <p className="mb-3 text-sm text-ink-muted">Outstanding {money(due)}</p>
      <Field label="Amount (KSh)">
        <Input
          required
          type="number"
          min={1}
          max={due}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Record</Button>
      </div>
    </form>
  );
}
