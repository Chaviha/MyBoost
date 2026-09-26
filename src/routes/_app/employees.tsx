import { createFileRoute } from "@tanstack/react-router";
import { BriefcaseBusiness, Search, Store, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { money } from "@/lib/format";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/employees")({
  component: EmployeesPage,
});

function EmployeesPage() {
  const { selectedBusiness, businessEmployees, addEmployee, refreshPublicMarketplace, can, updateEmployee, deleteEmployee } = useLife();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  if (!can("manage_employees")) {
    return <AccessDenied need="The team list is only available to owners and admins." />;
  }
  if (!selectedBusiness) {
    return <EmptyState icon={BriefcaseBusiness} text="Add a business first." />;
  }

  const filtered = businessEmployees.filter((e) =>
    `${e.name} ${e.role} ${e.phone}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <Toolbar
        title="Professionals"
        subtitle={`Team at ${selectedBusiness.business_name}`}
        actionLabel="Add professional"
        onAction={() => setOpen(true)}
      />
      <div className="mb-3 flex h-11 items-center gap-2 rounded-md bg-paper px-3 shadow-border">
        <Search className="size-4 text-ink-faint" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search team..."
          className="h-full border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>
      <Card className="overflow-hidden p-0">
        {filtered.length === 0 ? (
          <EmptyState icon={BriefcaseBusiness} text="No employees yet for this business." compact />
        ) : (
          filtered.map((employee) => (
            <div
              key={employee.employee_id}
              className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex size-10 items-center justify-center rounded-md bg-leaf font-display text-sm font-medium text-forest">
                {employee.name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{employee.name}</p>
                <p className="text-xs text-ink-muted">{employee.phone}</p>
              </div>
              <span className="text-sm">{employee.role}</span>
              <span className="text-sm text-ink-muted">{employee.job_status}</span>
              {employee.salary ? (
                <span className="text-sm tabular-nums">{money(employee.salary)}</span>
              ) : null}
              <MoreActions actions={[
                { label: "Edit", icon: <Pencil className="size-4" />, onSelect: () => {
                  const name = window.prompt("Professional name", employee.name);
                  if (name === null) return;
                  const role = window.prompt("Role", employee.role) ?? employee.role;
                  const phone = window.prompt("Phone", employee.phone) ?? employee.phone;
                  updateEmployee(employee.employee_id, { name: name.trim() || employee.name, role, phone });
                  void refreshPublicMarketplace();
                  toast.success("Professional updated.");
                } },
                { label: "Delete", destructive: true, icon: <Trash2 className="size-4" />, onSelect: () => {
                  if (window.confirm(`Delete ${employee.name}?`)) { deleteEmployee(employee.employee_id); toast.success("Professional deleted."); }
                } },
              ]} />
              {employee.listed ? (
                <Badge tone="forest">
                  <Store className="size-3" />
                  Listed
                </Badge>
              ) : (
                <Badge>{employee.status}</Badge>
              )}
            </div>
          ))
        )}
      </Card>

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add employee</DialogTitle>
          </DialogHeader>
          <EmployeeForm
            onCancel={() => setOpen(false)}
            onSubmit={async (form) => {
              await addEmployee(form);
              await refreshPublicMarketplace();
              toast.success(
                form.listed
                  ? `${form.name} added and listed on the marketplace.`
                  : `${form.name} added to the team.`,
              );
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function EmployeeForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (form: {
    name: string;
    phone: string;
    email: string;
    role: string;
    jobStatus: string;
    listed: boolean;
    location: string;
  }) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    role: "",
    jobStatus: "Active",
    listed: false,
    location: "",
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.name || !form.role) return;
        onSubmit(form);
      }}
    >
      <Field label="Name">
        <Input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>
      <Field label="Role">
        <Input
          required
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          placeholder="Chef / Engineer / Manager"
        />
      </Field>
      <Field label="Email" hint="(creates their LifeBoost login)">
        <Input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </Field>
      <Field label="Phone">
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </Field>
      <Field label="Job status">
        <Select
          value={form.jobStatus}
          onChange={(e) => setForm({ ...form, jobStatus: e.target.value })}
        >
          {["Active", "Not started", "On leave", "Completed"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </Field>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.listed}
          onChange={(e) => setForm({ ...form, listed: e.target.checked })}
        />
        List professional on the marketplace
      </label>
      {form.listed ? (
        <Field label="Location">
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="Westlands, Nairobi"
          />
        </Field>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Add employee</Button>
      </div>
    </form>
  );
}
