import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
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

export const Route = createFileRoute("/_app/quotations")({
  component: QuotationsPage,
});

function QuotationsPage() {
  const { selectedBusiness, businessQuotes, businessCustomers, addQuotation, can } = useLife();
  const [open, setOpen] = useState(false);

  if (!can("manage_quotes")) {
    return <AccessDenied need="Quotations are for business owners." />;
  }
  if (!selectedBusiness) return <EmptyState icon={ListChecks} text="Add a business first." />;

  return (
    <>
      <Toolbar
        title="Quotations"
        subtitle={`Estimates sent from ${selectedBusiness.business_name}`}
        actionLabel="New quotation"
        onAction={() => setOpen(true)}
      />
      {businessQuotes.length === 0 ? (
        <EmptyState icon={ListChecks} text="No quotations yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {businessQuotes.map((q) => (
            <Card key={q.quote_id} className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <p className="font-medium">{q.customer_name}</p>
                <p className="text-xs text-ink-muted">{q.notes || formatDate(q.date)}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="font-medium tabular-nums">{money(q.total)}</p>
                <Badge tone={q.status === "Accepted" ? "forest" : "amber"}>{q.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New quotation</DialogTitle>
          </DialogHeader>
          <QuoteForm
            customers={businessCustomers}
            onCancel={() => setOpen(false)}
            onSubmit={(form) => {
              addQuotation(form);
              toast.success("Quotation sent.");
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuoteForm({
  customers,
  onCancel,
  onSubmit,
}: {
  customers: { customer_id: string; name: string }[];
  onCancel: () => void;
  onSubmit: (form: { customerId: string; total: string; notes: string }) => void;
}) {
  const [form, setForm] = useState({ customerId: "", total: "", notes: "" });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.customerId || !form.total) return;
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
      <Field label="Notes">
        <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Send</Button>
      </div>
    </form>
  );
}
