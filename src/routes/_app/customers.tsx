import { createFileRoute } from "@tanstack/react-router";
import { Bell, Minus, Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { Toolbar } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { ChargeDialog, LedgerList, PaymentDialog } from "@/components/tab-dialog";
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
import { chargeModeLabel } from "@/lib/roles";
import { useLife } from "@/lib/store";
import type { ChargeMode, Customer, CustomerStatus } from "@/lib/types";

export const Route = createFileRoute("/_app/customers")({
  component: CustomersPage,
});

function toneFor(status: CustomerStatus) {
  if (status === "Overdue") return "red" as const;
  if (status === "Due soon") return "amber" as const;
  if (status === "Paid") return "forest" as const;
  return "neutral" as const;
}

function CustomersPage() {
  const {
    selectedBusiness,
    businessCustomers,
    businessProducts,
    addCustomer,
    addCustomerCharge,
    recordCustomerPayment,
    setChargeMode,
    ledgerFor,
    canCharge,
    canPay,
    can,
  } = useLife();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [chargeFor, setChargeFor] = useState<Customer | null>(null);
  const [payFor, setPayFor] = useState<Customer | null>(null);

  if (!can("manage_customers")) {
    return (
      <AccessDenied need="Customer tabs are managed by the business owner. Switch to an owner, or open My tab if you buy from a shop." />
    );
  }
  if (!selectedBusiness) {
    return <EmptyState icon={Users} text="Add a business first." />;
  }

  const filtered = businessCustomers.filter((c) =>
    `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <Toolbar
        title="Customers"
        subtitle={`Running tabs at ${selectedBusiness.business_name}. Add a charge each time they take stock.`}
        actionLabel="Add customer"
        onAction={() => setOpen(true)}
      />
      <div className="mb-3 flex h-11 items-center gap-2 rounded-md bg-paper px-3 shadow-border">
        <Search className="size-4 text-ink-faint" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search customers..."
          className="h-full border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <EmptyState icon={Users} text="No customers yet for this business." />
        ) : (
          filtered.map((customer) => {
            const expanded = openId === customer.customer_id;
            return (
              <Card key={customer.customer_id} className="p-0">
                <button
                  type="button"
                  className="flex w-full flex-col gap-2 px-4 py-3 text-left sm:flex-row sm:items-center sm:gap-4"
                  onClick={() => setOpenId(expanded ? null : customer.customer_id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{customer.name}</p>
                    <p className="text-xs text-ink-muted">{customer.phone}</p>
                  </div>
                  <p className="text-sm font-medium tabular-nums">{money(customer.amount)}</p>
                  <Badge tone={toneFor(customer.status)}>{customer.status}</Badge>
                  <Badge>{chargeModeLabel(customer.charge_mode)}</Badge>
                </button>
                {expanded ? (
                  <div className="border-t border-line px-4 py-4">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-ink-muted">
                        Due {formatDate(customer.due_date)}
                        {customer.user_id ? " · linked LifeBoost account" : ""}
                      </p>
                      <label className="flex items-center gap-2 text-sm">
                        <span className="text-ink-muted">Who adds charges</span>
                        <Select
                          className="h-9 w-auto min-w-44"
                          value={customer.charge_mode}
                          onChange={(e) => {
                            const mode = e.target.value as ChargeMode;
                            setChargeMode(customer.customer_id, mode);
                            toast.success(`${customer.name}: ${chargeModeLabel(mode)}.`);
                          }}
                        >
                          <option value="owner">Only owner</option>
                          <option value="both">Owner or customer</option>
                          <option value="customer">Only customer</option>
                        </Select>
                      </label>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {canCharge(customer) ? (
                        <Button size="sm" onClick={() => setChargeFor(customer)}>
                          <Plus className="size-3.5" />
                          Add charge
                        </Button>
                      ) : (
                        <p className="text-xs text-ink-muted">
                          This tab is set so only the customer posts new charges.
                        </p>
                      )}
                      {canPay(customer) ? (
                        <Button size="sm" variant="secondary" onClick={() => setPayFor(customer)}>
                          <Minus className="size-3.5" />
                          Record payment
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          toast.success(
                            `Reminder sent to ${customer.name} · ${money(customer.amount)} due ${formatDate(customer.due_date)}.`,
                          )
                        }
                      >
                        <Bell className="size-3.5" />
                        Remind
                      </Button>
                    </div>
                    <LedgerList entries={ledgerFor(customer.customer_id)} />
                  </div>
                ) : null}
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
          </DialogHeader>
          <CustomerForm
            onCancel={() => setOpen(false)}
            onSubmit={(form) => {
              addCustomer(form);
              toast.success(`${form.name} added. Their tab starts at ${form.amount || 0}.`);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <ChargeDialog
        customer={chargeFor}
        products={businessProducts}
        open={Boolean(chargeFor)}
        onClose={() => setChargeFor(null)}
        onSubmit={(form) => {
          addCustomerCharge(form);
          toast.success("Charge added to the tab.");
        }}
      />
      <PaymentDialog
        customer={payFor}
        open={Boolean(payFor)}
        onClose={() => setPayFor(null)}
        onSubmit={(form) => {
          recordCustomerPayment(form);
          toast.success("Payment recorded.");
        }}
      />
    </>
  );
}

function CustomerForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (form: {
    name: string;
    phone: string;
    email: string;
    amount: string;
    due: string;
    charge_mode: ChargeMode;
    type: string;
  }) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    amount: "0",
    due: "",
    charge_mode: "owner" as ChargeMode,
    type: "individual",
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.name || !form.due) return;
        onSubmit(form);
      }}
    >
      <Field label="Customer name">
        <Input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>
      <Field label="Phone">
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </Field>
      <Field label="Email" hint="(links their LifeBoost login)">
        <Input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </Field>
      <Field label="Opening balance (KSh)">
        <Input
          type="number"
          min={0}
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
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
      <Field label="Type">
        <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="individual">Individual</option>
          <option value="company">Company</option>
        </Select>
      </Field>
      <Field label="Who can add charges">
        <Select
          value={form.charge_mode}
          onChange={(e) => setForm({ ...form, charge_mode: e.target.value as ChargeMode })}
        >
          <option value="owner">Only I add (owner)</option>
          <option value="both">Owner or customer</option>
          <option value="customer">Only the customer adds</option>
        </Select>
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Add customer</Button>
      </div>
    </form>
  );
}
