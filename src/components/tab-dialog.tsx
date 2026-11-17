import { Download, Pencil, Printer, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { MoreActions } from "@/components/more-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTime, money, uid } from "@/lib/format";
import type { Customer, Invoice, LedgerEntry, PaymentLineItem, Product } from "@/lib/types";
import {
  downloadPaymentReceiptHtml,
  printPaymentReceipt,
} from "@/lib/payment-invoice-export";
import { useLife } from "@/lib/store";
import { cn } from "@/lib/utils";

export function LedgerList({
  entries,
  customer,
  onEditPayment,
  canManagePayments = true,
}: {
  entries: LedgerEntry[];
  customer?: Customer | null;
  onEditPayment?: (entry: LedgerEntry) => void;
  /** When false (e.g. customer viewing own tab), only print/download are offered. */
  canManagePayments?: boolean;
}) {
  const {
    state,
    reverseCustomerPayment,
    deleteCustomerPayment,
    selectedBusiness,
  } = useLife();

  if (!entries.length) {
    return <p className="py-4 text-sm text-ink-muted">No movements yet on this tab.</p>;
  }

  return (
    <ul className="flex flex-col">
      {entries.map((entry) => {
        const who =
          state.users.find((u) => u.user_id === entry.posted_by)?.name ?? "Someone";
        const charge = entry.type === "charge";
        const reversed = entry.status === "reversed";
        const isPayment = entry.type === "payment";
        const bizFromState =
          selectedBusiness?.business_id === entry.business_id
            ? selectedBusiness
            : state.businesses.find((b) => b.business_id === entry.business_id);
        const business = {
          business_name: bizFromState?.business_name || "Business",
          phone: bizFromState?.phone,
          email: bizFromState?.email,
          region: bizFromState?.region,
        };
        const receiptDoc = {
          receipt_number: entry.receipt_number || entry.entry_id,
          entry_id: entry.entry_id,
          customer_name: customer?.name || "Customer",
          amount: entry.amount,
          date: entry.date,
          description: entry.description,
          method: entry.method,
          invoice_id: entry.invoice_id,
          payment_kind: entry.payment_kind,
          line_items: entry.line_items,
          balance_after: customer?.amount,
          status: entry.status,
        };
        const paymentActions = isPayment && !reversed
          ? [
              {
                label: "Print receipt",
                icon: <Printer className="size-4" />,
                onSelect: () => printPaymentReceipt(receiptDoc, business),
              },
              {
                label: "Download receipt",
                icon: <Download className="size-4" />,
                onSelect: () => {
                  downloadPaymentReceiptHtml(receiptDoc, business);
                  toast.success("Receipt downloaded.");
                },
              },
              ...(canManagePayments && onEditPayment
                ? [
                    {
                      label: "Edit",
                      icon: <Pencil className="size-4" />,
                      onSelect: () => onEditPayment(entry),
                    },
                  ]
                : []),
              ...(canManagePayments
                ? [
                    {
                      label: "Reverse",
                      icon: <RotateCcw className="size-4" />,
                      onSelect: () => {
                        if (
                          window.confirm(
                            `Reverse payment ${entry.receipt_number || entry.entry_id}? Balance will be restored.`,
                          )
                        ) {
                          reverseCustomerPayment(entry.entry_id);
                          toast.success("Payment reversed.");
                        }
                      },
                    },
                    {
                      label: "Delete",
                      destructive: true as const,
                      icon: <Trash2 className="size-4" />,
                      onSelect: () => {
                        if (
                          window.confirm(
                            "Permanently delete this payment record? Prefer Reverse to keep an audit trail.",
                          )
                        ) {
                          deleteCustomerPayment(entry.entry_id);
                          toast.success("Payment deleted.");
                        }
                      },
                    },
                  ]
                : []),
            ]
          : [];

        return (
          <li
            key={entry.entry_id}
            className={cn(
              "flex items-start justify-between gap-3 border-b border-line py-2.5 last:border-0",
              reversed && "opacity-60",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {entry.description}
                {reversed ? (
                  <span className="ml-2 text-xs font-normal text-clay">Reversed</span>
                ) : null}
                {entry.status === "edited" ? (
                  <span className="ml-2 text-xs font-normal text-ink-muted">Edited</span>
                ) : null}
              </p>
              <p className="text-xs text-ink-muted">
                {who} · {formatDateTime(entry.date)}
                {entry.receipt_number ? ` · ${entry.receipt_number}` : ""}
                {entry.invoice_id ? ` · Inv ${entry.invoice_id}` : ""}
                {entry.method ? ` · ${entry.method}` : ""}
              </p>
              {entry.line_items && entry.line_items.length > 0 ? (
                <p className="mt-0.5 text-xs text-ink-muted">
                  {entry.line_items.map((li) => li.description).join(" · ")}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <p
                className={
                  charge
                    ? "text-sm font-medium tabular-nums text-clay"
                    : "text-sm font-medium tabular-nums text-forest"
                }
              >
                {charge ? "+" : "−"}
                {money(entry.amount)}
              </p>
              {paymentActions.length > 0 ? (
                <MoreActions label="Payment actions" actions={paymentActions} />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ChargeDialog({
  customer,
  products,
  open,
  onClose,
  onSubmit,
}: {
  customer: Customer | null;
  products: Product[];
  open: boolean;
  onClose: () => void;
  onSubmit: (form: {
    customerId: string;
    amount: string;
    description: string;
    productId?: string;
    qty?: string;
    lineItems?: PaymentLineItem[];
  }) => void;
}) {
  const [lines, setLines] = useState<
    Array<{ key: string; productId: string; description: string; qty: string; unitPrice: string }>
  >([]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setLines([]);
    setAmount("");
    setDescription("");
  }, [open, customer?.customer_id]);

  const linesTotal = lines.reduce((sum, line) => {
    const qty = Math.max(0, Number(line.qty || 0));
    const price = Number(line.unitPrice || 0);
    return sum + qty * price;
  }, 0);

  const preview = lines.length > 0 ? linesTotal : Number(amount || 0);

  if (!customer) return null;

  function updateLine(
    key: string,
    patch: Partial<{ productId: string; description: string; qty: string; unitPrice: string }>,
  ) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function applyProduct(key: string, productId: string) {
    const product = products.find((p) => p.product_id === productId);
    updateLine(key, {
      productId,
      description: product ? product.name : "",
      unitPrice: product ? String(product.selling_price) : "",
    });
  }

  function buildLineItems(): PaymentLineItem[] {
    return lines
      .map((line) => {
        const qty = Math.max(0, Number(line.qty || 0));
        const unit_price = Number(line.unitPrice || 0);
        const lineAmount = qty * unit_price;
        if (lineAmount <= 0 && !line.description) return null;
        return {
          line_id: line.key,
          product_id: line.productId || undefined,
          description:
            line.description ||
            products.find((p) => p.product_id === line.productId)?.name ||
            "Item",
          qty,
          unit_price,
          amount: lineAmount,
        };
      })
      .filter(Boolean) as PaymentLineItem[];
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="w-[min(calc(100%-1.5rem),36rem)] max-w-none">
        <DialogHeader>
          <DialogTitle>Add charge · {customer.name}</DialogTitle>
          <DialogDescription>
            Products or services taken on credit. Current balance {money(customer.amount)}.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (preview <= 0) {
              toast.error(
                lines.length
                  ? "Add quantities and rates so the total is greater than zero."
                  : "Enter an amount or add product lines.",
              );
              return;
            }
            const lineItems = buildLineItems();
            const first = lineItems[0];
            onSubmit({
              customerId: customer.customer_id,
              amount: String(preview),
              description:
                description ||
                (lineItems.length
                  ? lineItems.map((l) => `${l.qty} × ${l.description}`).join(", ")
                  : "Product taken on credit"),
              productId: first?.product_id,
              qty: first ? String(first.qty) : undefined,
              lineItems: lineItems.length ? lineItems : undefined,
            });
            setLines([]);
            setAmount("");
            setDescription("");
            onClose();
          }}
        >
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="flex items-center justify-between gap-2 border-b border-line bg-canvas px-3 py-2">
              <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                Line items
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    {
                      key: uid("LN"),
                      productId: "",
                      description: "",
                      qty: "1",
                      unitPrice: "",
                    },
                  ])
                }
              >
                + Add line
              </Button>
            </div>

            {lines.length === 0 ? (
              <div className="px-3 py-4 text-sm text-ink-muted">
                Add products or services inline, or leave empty and enter a custom amount below.
              </div>
            ) : (
              <div className="divide-y divide-line">
                <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_5.5rem_2rem] gap-2 px-3 py-1.5 text-[10px] font-medium tracking-wide text-ink-muted uppercase sm:grid">
                  <span>Item</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Amount</span>
                  <span />
                </div>
                {lines.map((line) => {
                  const lineAmt =
                    Math.max(0, Number(line.qty || 0)) * Number(line.unitPrice || 0);
                  return (
                    <div
                      key={line.key}
                      className="grid grid-cols-1 gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_5.5rem_2rem] sm:items-center"
                    >
                      <div className="min-w-0 space-y-1.5">
                        {products.length > 0 ? (
                          <Select
                            value={line.productId}
                            onChange={(e) => applyProduct(line.key, e.target.value)}
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
                            updateLine(line.key, { description: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-ink-muted uppercase sm:hidden">
                          Qty
                        </label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          className="text-right tabular-nums"
                          value={line.qty}
                          onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-ink-muted uppercase sm:hidden">
                          Rate
                        </label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          className="text-right tabular-nums"
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(line.key, { unitPrice: e.target.value })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between sm:justify-end">
                        <span className="text-[10px] font-medium text-ink-muted uppercase sm:hidden">
                          Amount
                        </span>
                        <span className="text-sm font-medium tabular-nums">{money(lineAmt)}</span>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-leaf hover:text-ink"
                          aria-label="Remove line"
                          onClick={() =>
                            setLines((prev) => prev.filter((l) => l.key !== line.key))
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between bg-canvas px-3 py-2.5 text-sm">
                  <span className="text-ink-muted">Lines total</span>
                  <span className="font-medium tabular-nums">{money(linesTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {lines.length === 0 ? (
            <Field label="Amount (KSh)">
              <Input
                required
                type="number"
                min={0.01}
                step="any"
                inputMode="decimal"
                className="tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
          ) : null}

          <Field label="Note">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Took stock on credit"
            />
          </Field>

          <div className="rounded-lg bg-canvas px-3 py-2.5 text-sm text-ink-muted">
            Charge{" "}
            <span className="font-medium text-ink tabular-nums">{money(preview)}</span>
            {" · "}new balance{" "}
            <span className="tabular-nums">{money(customer.amount + preview)}</span>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Add charge</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}


type PaymentFormState = {
  kind: "direct" | "invoice";
  invoiceId: string;
  amount: string;
  description: string;
  method: string;
  lines: Array<{
    key: string;
    productId: string;
    description: string;
    qty: string;
    unitPrice: string;
  }>;
  linesLocked: boolean;
};

function emptyLine() {
  return {
    key: uid("LN"),
    productId: "",
    description: "",
    qty: "1",
    unitPrice: "",
  };
}

function linesFromInvoice(inv: Invoice | undefined) {
  if (!inv?.line_items?.length) return [];
  return inv.line_items.map((li) => ({
    key: li.line_id || uid("LN"),
    productId: li.product_id || "",
    description: li.description || "Item",
    qty: String(li.qty || 1),
    unitPrice: String(li.unit_price || 0),
  }));
}

export function PaymentDialog({
  customer,
  open,
  onClose,
  onSubmit,
  products = [],
  invoices = [],
  editing,
}: {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
  products?: Product[];
  invoices?: Invoice[];
  editing?: LedgerEntry | null;
  onSubmit: (form: {
    customerId: string;
    amount: string;
    description: string;
    invoiceId?: string;
    paymentKind: "direct" | "invoice";
    method?: string;
    lineItems?: PaymentLineItem[];
    entryId?: string;
  }) => void;
}) {
  const productList = Array.isArray(products) ? products : [];
  const invoiceList = Array.isArray(invoices) ? invoices : [];

  const [form, setForm] = useState<PaymentFormState>({
    kind: "direct",
    invoiceId: "",
    amount: "",
    description: "",
    method: "",
    lines: [],
    linesLocked: false,
  });

  const openInvoices = useMemo(
    () =>
      invoiceList.filter(
        (inv) =>
          inv &&
          inv.customer_id === customer?.customer_id &&
          inv.status !== "Paid" &&
          Number(inv.total || 0) - Number(inv.paid || 0) > 0,
      ),
    [invoiceList, customer?.customer_id],
  );

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        kind: editing.payment_kind === "invoice" || editing.invoice_id ? "invoice" : "direct",
        invoiceId: editing.invoice_id || "",
        amount: String(editing.amount || ""),
        description: editing.description || "",
        method: editing.method || "",
        lines: (editing.line_items || []).map((li) => ({
          key: li.line_id || uid("LN"),
          productId: li.product_id || "",
          description: li.description,
          qty: String(li.qty || 1),
          unitPrice: String(li.unit_price || 0),
        })),
        linesLocked: Boolean(editing.invoice_id),
      });
      return;
    }
    setForm({
      kind: "direct",
      invoiceId: "",
      amount: "",
      description: "",
      method: "",
      lines: [],
      linesLocked: false,
    });
  }, [open, editing]);

  const selectedInvoice = openInvoices.find((i) => i.invoice_id === form.invoiceId);
  const invoiceDue = selectedInvoice
    ? Math.max(0, Number(selectedInvoice.total || 0) - Number(selectedInvoice.paid || 0))
    : 0;

  const linesTotal = form.lines.reduce((sum, line) => {
    const qty = Math.max(0, Number(line.qty || 0));
    const price = Number(line.unitPrice || 0);
    return sum + qty * price;
  }, 0);

  const amountValue =
    form.kind === "invoice"
      ? Number(form.amount || 0) || invoiceDue
      : form.lines.length > 0
        ? linesTotal
        : Number(form.amount || 0);

  if (!customer) return null;

  function selectInvoice(invoiceId: string) {
    const inv = openInvoices.find((i) => i.invoice_id === invoiceId);
    const due = inv
      ? Math.max(0, Number(inv.total || 0) - Number(inv.paid || 0))
      : 0;
    setForm((prev) => ({
      ...prev,
      kind: "invoice",
      invoiceId,
      amount: String(due || ""),
      description: inv
        ? prev.description || `Payment for invoice ${inv.invoice_id}`
        : prev.description,
      lines: linesFromInvoice(inv),
      linesLocked: true,
    }));
  }

  function switchKind(kind: "direct" | "invoice") {
    if (kind === "direct") {
      setForm((prev) => ({
        ...prev,
        kind: "direct",
        invoiceId: "",
        lines: prev.linesLocked ? [] : prev.lines,
        linesLocked: false,
        amount: "",
        description: prev.linesLocked ? "" : prev.description,
      }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      kind: "invoice",
      linesLocked: true,
      lines: prev.invoiceId
        ? linesFromInvoice(openInvoices.find((i) => i.invoice_id === prev.invoiceId))
        : [],
    }));
  }

  function updateLine(
    key: string,
    patch: Partial<{ productId: string; description: string; qty: string; unitPrice: string }>,
  ) {
    if (form.linesLocked) return;
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    }));
  }

  function applyProductToLine(key: string, productId: string) {
    if (form.linesLocked) return;
    const product = productList.find((p) => p.product_id === productId);
    updateLine(key, {
      productId,
      description: product ? product.name : "",
      unitPrice: product ? String(product.selling_price) : "",
    });
  }

  function buildLineItems(): PaymentLineItem[] {
    return form.lines
      .map((line) => {
        const qty = Math.max(0, Number(line.qty || 0));
        const unit_price = Number(line.unitPrice || 0);
        const amount = qty * unit_price;
        if (amount <= 0 && !line.description) return null;
        return {
          line_id: line.key,
          product_id: line.productId || undefined,
          description:
            line.description ||
            productList.find((p) => p.product_id === line.productId)?.name ||
            "Item",
          qty,
          unit_price,
          amount,
        };
      })
      .filter(Boolean) as PaymentLineItem[];
  }

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const lineItems = buildLineItems();
    let payAmount = amountValue;
    if (form.kind === "invoice") {
      if (!form.invoiceId) {
        toast.error("Select an invoice.");
        return;
      }
      if (payAmount <= 0) payAmount = invoiceDue;
      if (payAmount <= 0) {
        toast.error("Nothing due on this invoice.");
        return;
      }
      if (invoiceDue > 0 && payAmount > invoiceDue + 0.001) {
        toast.error(`Amount cannot exceed outstanding ${money(invoiceDue)}.`);
        return;
      }
    } else if (payAmount <= 0) {
      toast.error(
        form.lines.length
          ? "Add quantities and rates so the total is greater than zero."
          : "Enter a payment amount or add product lines.",
      );
      return;
    }

    onSubmit({
      customerId: customer.customer_id,
      amount: String(payAmount),
      description:
        form.description ||
        (form.kind === "invoice"
          ? `Payment for invoice ${form.invoiceId}`
          : lineItems.length
            ? lineItems.map((l) => l.description).join(", ")
            : "Payment received"),
      invoiceId: form.kind === "invoice" ? form.invoiceId : undefined,
      paymentKind: form.kind,
      method: form.method || undefined,
      lineItems: lineItems.length ? lineItems : undefined,
      entryId: editing?.entry_id,
    });
    onClose();
  }

  const balanceAfter = Math.max(
    0,
    Number(customer.amount) -
      (editing ? amountValue - Number(editing.amount || 0) : amountValue),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="w-[min(calc(100%-1.5rem),36rem)] max-w-none">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit payment" : "Record payment"} · {customer.name}
          </DialogTitle>
          <DialogDescription>
            Tab balance {money(customer.amount)}
            {form.kind === "invoice" && selectedInvoice
              ? ` · Invoice outstanding ${money(invoiceDue)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Scenario toggle — compact segmented control */}
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-canvas p-1">
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-2 text-center text-sm font-medium transition",
              form.kind === "invoice"
                ? "bg-paper text-ink shadow-border"
                : "text-ink-muted hover:text-ink",
            )}
            onClick={() => switchKind("invoice")}
          >
            Invoice-linked
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-2 text-center text-sm font-medium transition",
              form.kind === "direct"
                ? "bg-paper text-ink shadow-border"
                : "text-ink-muted hover:text-ink",
            )}
            onClick={() => switchKind("direct")}
          >
            Direct payment
          </button>
        </div>
        <p className="mb-4 -mt-2 text-xs text-ink-muted">
          {form.kind === "invoice"
            ? "Pay against an existing invoice. Line items load automatically."
            : "No invoice. Add products or services inline, or enter an amount only."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {form.kind === "invoice" ? (
            <Field label="Invoice">
              <Select value={form.invoiceId} onChange={(e) => selectInvoice(e.target.value)}>
                <option value="">Select open invoice…</option>
                {openInvoices.map((inv) => {
                  const due = Math.max(0, Number(inv.total || 0) - Number(inv.paid || 0));
                  const n = inv.line_items?.length || 0;
                  return (
                    <option key={inv.invoice_id} value={inv.invoice_id}>
                      {inv.invoice_id} · due {money(due)}
                      {n ? ` · ${n} item${n === 1 ? "" : "s"}` : ""}
                    </option>
                  );
                })}
              </Select>
              {openInvoices.length === 0 ? (
                <p className="mt-1 text-xs text-ink-muted">
                  No open invoices. Create one under Invoices, or use direct payment.
                </p>
              ) : null}
            </Field>
          ) : null}

          {/* Inline line items — table-style */}
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="flex items-center justify-between gap-2 border-b border-line bg-canvas px-3 py-2">
              <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                {form.kind === "invoice" ? "Invoice items" : "Line items"}
              </p>
              {form.kind === "direct" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    setForm((prev) => ({ ...prev, lines: [...prev.lines, emptyLine()] }))
                  }
                >
                  + Add line
                </Button>
              ) : null}
            </div>

            {form.lines.length === 0 ? (
              <div className="px-3 py-4 text-sm text-ink-muted">
                {form.kind === "invoice"
                  ? form.invoiceId
                    ? "This invoice has no stored line items. You can still allocate a payment amount below."
                    : "Select an invoice to load its products."
                  : "Optional. Add products/services, or leave empty and enter an amount only."}
              </div>
            ) : (
              <div className="divide-y divide-line">
                {/* Column headers — desktop */}
                <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_5.5rem_2rem] gap-2 px-3 py-1.5 text-[10px] font-medium tracking-wide text-ink-muted uppercase sm:grid">
                  <span>Item</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Amount</span>
                  <span />
                </div>

                {form.lines.map((line) => {
                  const lineAmt =
                    Math.max(0, Number(line.qty || 0)) * Number(line.unitPrice || 0);
                  return (
                    <div
                      key={line.key}
                      className="grid grid-cols-1 gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_5.5rem_2rem] sm:items-center"
                    >
                      <div className="min-w-0 space-y-1.5">
                        {form.kind === "direct" && productList.length > 0 ? (
                          <Select
                            value={line.productId}
                            onChange={(e) => applyProductToLine(line.key, e.target.value)}
                          >
                            <option value="">Custom item</option>
                            {productList.map((p) => (
                              <option key={p.product_id} value={p.product_id}>
                                {p.name} · {money(p.selling_price)}
                              </option>
                            ))}
                          </Select>
                        ) : null}
                        <Input
                          placeholder="Description"
                          value={line.description}
                          readOnly={form.linesLocked}
                          className={cn(form.linesLocked && "bg-canvas")}
                          onChange={(e) =>
                            updateLine(line.key, { description: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-ink-muted uppercase sm:hidden">
                          Qty
                        </label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          placeholder="Qty"
                          value={line.qty}
                          readOnly={form.linesLocked}
                          className={cn("text-right tabular-nums", form.linesLocked && "bg-canvas")}
                          onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-ink-muted uppercase sm:hidden">
                          Rate
                        </label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          placeholder="Rate"
                          value={line.unitPrice}
                          readOnly={form.linesLocked}
                          className={cn("text-right tabular-nums", form.linesLocked && "bg-canvas")}
                          onChange={(e) =>
                            updateLine(line.key, { unitPrice: e.target.value })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between sm:justify-end">
                        <span className="text-[10px] font-medium text-ink-muted uppercase sm:hidden">
                          Amount
                        </span>
                        <span className="text-sm tabular-nums font-medium">
                          {money(lineAmt)}
                        </span>
                      </div>
                      <div className="flex justify-end">
                        {form.kind === "direct" ? (
                          <button
                            type="button"
                            className="flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-leaf hover:text-ink"
                            aria-label="Remove line"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                lines: prev.lines.filter((l) => l.key !== line.key),
                              }))
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                <div className="flex items-center justify-between bg-canvas px-3 py-2.5 text-sm">
                  <span className="text-ink-muted">Lines total</span>
                  <span className="font-medium tabular-nums">{money(linesTotal)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={
                form.kind === "invoice"
                  ? `Amount to pay (max ${money(invoiceDue)})`
                  : form.lines.length > 0
                    ? "Payment amount"
                    : "Amount (KSh)"
              }
            >
              <Input
                required={form.kind === "direct" && form.lines.length === 0}
                type="number"
                min={0.01}
                step="any"
                inputMode="decimal"
                max={form.kind === "invoice" && invoiceDue > 0 ? invoiceDue : undefined}
                value={
                  form.kind === "direct" && form.lines.length > 0
                    ? String(linesTotal)
                    : form.amount
                }
                readOnly={form.kind === "direct" && form.lines.length > 0}
                className={cn(
                  "tabular-nums",
                  form.kind === "direct" && form.lines.length > 0 && "bg-canvas",
                )}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              />
            </Field>
            <Field label="Method">
              <Select
                value={form.method}
                onChange={(e) => setForm((prev) => ({ ...prev, method: e.target.value }))}
              >
                <option value="">—</option>
                <option value="Cash">Cash</option>
                <option value="M-Pesa">M-Pesa</option>
                <option value="Bank">Bank transfer</option>
                <option value="Card">Card</option>
                <option value="Other">Other</option>
              </Select>
            </Field>
          </div>

          <Field label="Note">
            <Input
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder={
                form.kind === "invoice"
                  ? "e.g. Part payment for invoice"
                  : "e.g. M-Pesa code, reference"
              }
            />
          </Field>

          <div className="rounded-lg bg-canvas px-3 py-2.5 text-sm text-ink-muted">
            {form.kind === "invoice" ? (
              <>
                Allocating{" "}
                <span className="font-medium text-ink tabular-nums">
                  {money(amountValue || invoiceDue)}
                </span>
                {form.invoiceId ? (
                  <>
                    {" "}
                    to <span className="font-medium text-ink">{form.invoiceId}</span>
                    {" · "}remaining{" "}
                    <span className="tabular-nums">
                      {money(Math.max(0, invoiceDue - (amountValue || invoiceDue)))}
                    </span>
                  </>
                ) : null}
              </>
            ) : (
              <>
                Payment{" "}
                <span className="font-medium text-ink tabular-nums">{money(amountValue)}</span>
                {" · "}tab after{" "}
                <span className="tabular-nums">{money(balanceAfter)}</span>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {editing
                ? "Save payment"
                : form.kind === "invoice"
                  ? "Allocate to invoice"
                  : "Save payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
