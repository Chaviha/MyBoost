import { useState } from "react";
import { Field } from "@/components/field";
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
import { formatDateTime, money } from "@/lib/format";
import type { Customer, LedgerEntry, Product } from "@/lib/types";
import { useLife } from "@/lib/store";

export function LedgerList({ entries }: { entries: LedgerEntry[] }) {
  const { state } = useLife();
  if (!entries.length) {
    return <p className="py-4 text-sm text-ink-muted">No movements yet on this tab.</p>;
  }
  return (
    <ul className="flex flex-col">
      {entries.map((entry) => {
        const who =
          state.users.find((u) => u.user_id === entry.posted_by)?.name ?? "Someone";
        const charge = entry.type === "charge";
        return (
          <li
            key={entry.entry_id}
            className="flex items-start justify-between gap-3 border-b border-line py-2.5 last:border-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{entry.description}</p>
              <p className="text-xs text-ink-muted">
                {who} · {formatDateTime(entry.date)}
              </p>
            </div>
            <p
              className={
                charge
                  ? "shrink-0 text-sm font-medium tabular-nums text-clay"
                  : "shrink-0 text-sm font-medium tabular-nums text-forest"
              }
            >
              {charge ? "+" : "−"}
              {money(entry.amount)}
            </p>
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
  }) => void;
}) {
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const product = products.find((p) => p.product_id === productId);
  const preview = product ? product.selling_price * Math.max(1, Number(qty || 1)) : Number(amount || 0);

  if (!customer) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add charge · {customer.name}</DialogTitle>
          <DialogDescription>
            Use this when they take a product or service without paying now. Balance is currently{" "}
            {money(customer.amount)}.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (preview <= 0) return;
            onSubmit({
              customerId: customer.customer_id,
              amount: String(preview),
              description,
              productId: productId || undefined,
              qty: productId ? qty : undefined,
            });
            setProductId("");
            setQty("1");
            setAmount("");
            setDescription("");
            onClose();
          }}
        >
          {products.length ? (
            <Field label="Product">
              <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Custom amount</option>
                {products.map((p) => (
                  <option key={p.product_id} value={p.product_id}>
                    {p.name} · {money(p.selling_price)} / {p.unit}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {productId ? (
            <Field label="Quantity">
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </Field>
          ) : (
            <Field label="Amount (KSh)">
              <Input
                required={!productId}
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
          )}
          <Field label="Note">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={product ? `${qty} × ${product.name}` : "e.g. Took 2 bags of cement"}
            />
          </Field>
          <p className="mb-4 text-sm text-ink-muted">
            New balance {money(customer.amount + preview)}
          </p>
          <div className="flex justify-end gap-2">
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

export function PaymentDialog({
  customer,
  open,
  onClose,
  onSubmit,
}: {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (form: { customerId: string; amount: string; description: string }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  if (!customer) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment · {customer.name}</DialogTitle>
          <DialogDescription>
            This reduces their running tab. Current balance {money(customer.amount)}.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!amount) return;
            onSubmit({
              customerId: customer.customer_id,
              amount,
              description,
            });
            setAmount("");
            setDescription("");
            onClose();
          }}
        >
          <Field label="Amount (KSh)">
            <Input
              required
              type="number"
              min={1}
              max={customer.amount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Note">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. M-Pesa receipt"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Record payment</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
