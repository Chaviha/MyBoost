import { createFileRoute } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { Toolbar } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
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

export const Route = createFileRoute("/_app/expenses")({
  component: ExpensesPage,
});

function ExpensesPage() {
  const { selectedBusiness, businessExpenses, addExpense, can } = useLife();
  const [open, setOpen] = useState(false);

  if (!can("manage_expenses")) {
    return <AccessDenied need="Business expenses are managed by the owner." />;
  }
  if (!selectedBusiness) return <EmptyState icon={Receipt} text="Add a business first." />;

  const total = businessExpenses.reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <Toolbar
        title="Expenses"
        subtitle={`${selectedBusiness.business_name} · ${money(total)} this period`}
        actionLabel="Add expense"
        onAction={() => setOpen(true)}
      />
      {businessExpenses.length === 0 ? (
        <EmptyState icon={Receipt} text="No expenses recorded." />
      ) : (
        <Card className="overflow-hidden p-0">
          {businessExpenses.map((exp) => (
            <div
              key={exp.expense_id}
              className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0"
            >
              <div className="min-w-0">
                <p className="font-medium">{exp.category}</p>
                <p className="truncate text-xs text-ink-muted">
                  {exp.description || formatDate(exp.date)}
                </p>
              </div>
              <p className="text-sm font-medium tabular-nums">{money(exp.amount)}</p>
            </div>
          ))}
        </Card>
      )}
      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add expense</DialogTitle>
          </DialogHeader>
          <ExpenseForm
            onCancel={() => setOpen(false)}
            onSubmit={(form) => {
              addExpense(form);
              toast.success("Expense recorded.");
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExpenseForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (form: { category: string; description: string; amount: string }) => void;
}) {
  const [form, setForm] = useState({ category: "Other", description: "", amount: "" });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.amount) return;
        onSubmit(form);
      }}
    >
      <Field label="Category">
        <Select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          {["Rent", "Utilities", "Salaries", "Supplies", "Transport", "Marketing", "Other"].map(
            (c) => (
              <option key={c}>{c}</option>
            ),
          )}
        </Select>
      </Field>
      <Field label="Description">
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <Field label="Amount (KSh)">
        <Input
          required
          type="number"
          min={0}
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
