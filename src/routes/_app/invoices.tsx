import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Download, Pencil, Printer, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { MoreActions } from "@/components/more-actions";
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
import { formatDate, money, uid } from "@/lib/format";
import { SearchFilter } from "@/components/search-filter";
import { useLife } from "@/lib/store";
import type { Invoice, PaymentLineItem, Product } from "@/lib/types";
import {
  downloadInvoiceHtml,
  printInvoice,
} from "@/lib/payment-invoice-export";

export const Route = createFileRoute("/_app/invoices")({
  component: InvoicesPage,
});

function InvoicesPage() {
  const {
    selectedBusiness,
    businessInvoices,
    businessCustomers,
    businessProducts,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    recordInvoicePayment,
    can,
  } = useLife();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [pay, setPay] = useState<Invoice | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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
      <SearchFilter onSearch={setSearchQuery} placeholder="Search invoices…" />
      {businessInvoices.length === 0 ? (
        <EmptyState icon={CreditCard} text="No invoices yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {businessInvoices
            .filter((inv) =>
              `${inv.invoice_id} ${inv.customer_name} ${inv.status}`
                .toLowerCase()
                .includes(searchQuery.toLowerCase()),
            )
            .map((inv) => (
              <Card key={inv.invoice_id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{inv.customer_name}</p>
                    <p className="text-xs text-ink-muted">
                      {inv.invoice_id} · due {formatDate(inv.due_date)}
                      {inv.line_items?.length
                        ? ` · ${inv.line_items.length} item${inv.line_items.length === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>
                  <Badge
                    tone={
                      inv.status === "Paid" ? "forest" : inv.status === "Partial" ? "amber" : "red"
                    }
                  >
                    {inv.status}
                  </Badge>
                </div>
                <p className="mt-2 font-display text-2xl font-medium tabular-nums">
                  {money(inv.total)}
                </p>
                <p className="text-xs text-ink-muted">Paid {money(inv.paid)}</p>
                {inv.line_items && inv.line_items.length > 0 ? (
                  <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm text-ink-muted">
                    {inv.line_items.map((li) => (
                      <li key={li.line_id} className="flex justify-between gap-2">
                        <span>
                          {li.description}
                          {li.qty ? ` × ${li.qty}` : ""}
                        </span>
                        <span className="tabular-nums">{money(li.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {inv.status !== "Paid" ? (
                    <Button size="sm" onClick={() => setPay(inv)}>
                      Record payment
                    </Button>
                  ) : null}
                  <MoreActions
                    label="Invoice actions"
                    actions={[
                      {
                        label: "Print invoice",
                        icon: <Printer className="size-4" />,
                        onSelect: () =>
                          printInvoice(inv, {
                            business_name: selectedBusiness.business_name,
                            phone: selectedBusiness.phone,
                            email: selectedBusiness.email,
                            region: selectedBusiness.region,
                          }),
                      },
                      {
                        label: "Download invoice",
                        icon: <Download className="size-4" />,
                        onSelect: () => {
                          downloadInvoiceHtml(inv, {
                            business_name: selectedBusiness.business_name,
                            phone: selectedBusiness.phone,
                            email: selectedBusiness.email,
                            region: selectedBusiness.region,
                          });
                          toast.success("Invoice downloaded.");
                        },
                      },
                      {
                        label: "Edit",
                        icon: <Pencil className="size-4" />,
                        onSelect: () => setEditing(inv),
                      },
                      ...(inv.status !== "Paid"
                        ? [
                            {
                              label: "Record payment",
                              icon: <CreditCard className="size-4" />,
                              onSelect: () => setPay(inv),
                            },
                          ]
                        : []),
                      {
                        label: "Delete",
                        destructive: true,
                        icon: <Trash2 className="size-4" />,
                        onSelect: () => {
                          if (
                            window.confirm(
                              `Delete invoice ${inv.invoice_id}? Unpaid balance will be removed from the customer tab.`,
                            )
                          ) {
                            deleteInvoice(inv.invoice_id);
                            toast.success("Invoice deleted.");
                          }
                        },
                      },
                    ]}
                  />
                </div>
              </Card>
            ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent className="w-[min(calc(100%-1.5rem),36rem)] max-w-none">
          <DialogHeader>
            <DialogTitle>Create invoice</DialogTitle>
          </DialogHeader>
          <InvoiceForm
            customers={businessCustomers}
            products={businessProducts}
            onCancel={() => setOpen(false)}
            onSubmit={(form) => {
              addInvoice(form);
              toast.success("Invoice created.");
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="w-[min(calc(100%-1.5rem),36rem)] max-w-none">
          <DialogHeader>
            <DialogTitle>Edit invoice · {editing?.invoice_id}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <InvoiceForm
              customers={businessCustomers}
              products={businessProducts}
              initial={editing}
              onCancel={() => setEditing(null)}
              onSubmit={(form) => {
                updateInvoice(editing.invoice_id, form);
                toast.success("Invoice updated.");
                setEditing(null);
              }}
            />
          ) : null}
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
  products,
  onCancel,
  onSubmit,
  initial,
}: {
  customers: { customer_id: string; name: string }[];
  products: Product[];
  onCancel: () => void;
  initial?: Invoice | null;
  onSubmit: (form: {
    customerId: string;
    total: string;
    due: string;
    lineItems?: PaymentLineItem[];
    notes?: string;
  }) => void;
}) {
  const [customerId, setCustomerId] = useState(initial?.customer_id || "");
  const [due, setDue] = useState(initial?.due_date || "");
  const [total, setTotal] = useState(initial ? String(initial.total) : "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [lines, setLines] = useState<
    Array<{ key: string; productId: string; description: string; qty: string; unitPrice: string }>
  >(() =>
    (initial?.line_items || []).map((li) => ({
      key: li.line_id || uid("LN"),
      productId: li.product_id || "",
      description: li.description || "",
      qty: String(li.qty || 1),
      unitPrice: String(li.unit_price || 0),
    })),
  );

  const linesTotal = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + Math.max(0, Number(l.qty || 0)) * Number(l.unitPrice || 0),
        0,
      ),
    [lines],
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!customerId || !due) return;
        const lineItems: PaymentLineItem[] = lines
          .map((l) => {
            const qty = Math.max(0, Number(l.qty || 0));
            const unit_price = Number(l.unitPrice || 0);
            const amount = qty * unit_price;
            if (!l.description && amount <= 0) return null;
            return {
              line_id: l.key,
              product_id: l.productId || undefined,
              description: l.description || "Item",
              qty,
              unit_price,
              amount,
            };
          })
          .filter(Boolean) as PaymentLineItem[];
        const computed = lineItems.length ? linesTotal : Number(total || 0);
        if (computed <= 0) {
          toast.error("Add products or enter a total.");
          return;
        }
        onSubmit({
          customerId,
          total: String(computed),
          due,
          lineItems: lineItems.length ? lineItems : undefined,
          notes: notes || undefined,
        });
      }}
    >
      <Field label="Customer">
        <Select required value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Select…</option>
          {customers.map((c) => (
            <option key={c.customer_id} value={c.customer_id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="mb-3 overflow-hidden rounded-lg border border-line">
        <div className="flex items-center justify-between border-b border-line bg-canvas px-3 py-2">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
            Products / services
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() =>
              setLines((prev) => [
                ...prev,
                { key: uid("LN"), productId: "", description: "", qty: "1", unitPrice: "" },
              ])
            }
          >
            + Add item
          </Button>
        </div>
        {lines.length === 0 ? (
          <p className="px-3 py-3 text-xs text-ink-muted">
            Optional line items. These load automatically for invoice-linked payments.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {lines.map((line) => (
              <div
                key={line.key}
                className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_2rem] sm:items-start"
              >
                <div className="space-y-1">
                  {products.length ? (
                    <Select
                      value={line.productId}
                      onChange={(e) => {
                        const p = products.find((x) => x.product_id === e.target.value);
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key
                              ? {
                                  ...l,
                                  productId: e.target.value,
                                  description: p?.name || l.description,
                                  unitPrice: p ? String(p.selling_price) : l.unitPrice,
                                }
                              : l,
                          ),
                        );
                      }}
                    >
                      <option value="">Custom item</option>
                      {products.map((p) => (
                        <option key={p.product_id} value={p.product_id}>
                          {p.name} · {money(p.selling_price)}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                  <Input
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key ? { ...l, description: e.target.value } : l,
                        ),
                      )
                    }
                  />
                </div>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  className="text-right tabular-nums"
                  placeholder="Qty"
                  value={line.qty}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key ? { ...l, qty: e.target.value } : l,
                      ),
                    )
                  }
                />
                <Input
                  type="number"
                  min={0}
                  step="any"
                  className="text-right tabular-nums"
                  placeholder="Rate"
                  value={line.unitPrice}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key ? { ...l, unitPrice: e.target.value } : l,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9"
                  onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex justify-between bg-canvas px-3 py-2 text-sm">
              <span className="text-ink-muted">Items total</span>
              <span className="font-medium tabular-nums">{money(linesTotal)}</span>
            </div>
          </div>
        )}
      </div>

      {lines.length === 0 ? (
        <Field label="Total (KSh)">
          <Input
            required
            type="number"
            min={0}
            className="tabular-nums"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </Field>
      ) : null}

      <Field label="Due date">
        <Input required type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <Field label="Notes">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{initial ? "Save invoice" : "Create"}</Button>
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
