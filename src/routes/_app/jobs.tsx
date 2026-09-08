import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { Toolbar } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { JobCard } from "@/components/job-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLife } from "@/lib/store";
import type { JobStatus } from "@/lib/types";

export const Route = createFileRoute("/_app/jobs")({
  component: JobsPage,
});

function JobsPage() {
  const { selectedBusiness, businessJobs, businessEmployees, addJob, updateJobStatus, can, state } =
    useLife();
  const [open, setOpen] = useState(false);

  if (!can("manage_jobs")) {
    return <AccessDenied need="Assigning jobs is for business owners. Professionals use My jobs." />;
  }
  if (!selectedBusiness) return <EmptyState icon={ClipboardList} text="Add a business first." />;

  return (
    <>
      <Toolbar
        title="Jobs"
        subtitle={`Assign work at ${selectedBusiness.business_name}. Status is shared with the professional.`}
        actionLabel="Assign job"
        onAction={() => setOpen(true)}
      />
      {businessJobs.length === 0 ? (
        <EmptyState icon={ClipboardList} text="No jobs assigned yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {businessJobs.map((job) => {
            const emp = businessEmployees.find((e) => e.employee_id === job.employee_id);
            const customer = state.customers.find((c) => c.customer_id === job.customer_id);
            return (
              <JobCard
                key={job.job_id}
                job={job}
                person={`${emp?.name ?? "Unassigned"}${customer ? ` · ${customer.name}` : ""}`}
                overdue={+new Date(job.due_date) < +new Date("2026-08-31")}
                actions={
                  <Select
                    className="h-9 w-auto"
                    value={job.status}
                    onChange={(e) => {
                      updateJobStatus(job.job_id, e.target.value as JobStatus);
                      toast.success("Job status updated.");
                    }}
                  >
                    {["Not started", "In progress", "On hold", "Ready", "Completed"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                }
              />
            );
          })}
        </div>
      )}
      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign a job</DialogTitle>
          </DialogHeader>
          <JobForm
            employees={businessEmployees}
            onCancel={() => setOpen(false)}
            onSubmit={(form) => {
              addJob(form);
              toast.success("Job assigned.");
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function JobForm({
  employees,
  onCancel,
  onSubmit,
}: {
  employees: { employee_id: string; name: string; role: string }[];
  onCancel: () => void;
  onSubmit: (form: {
    employeeId: string;
    title: string;
    description: string;
    startDate: string;
    dueDate: string;
    estimatedCost: string;
    status: JobStatus;
  }) => void;
}) {
  const [form, setForm] = useState({
    employeeId: "",
    title: "",
    description: "",
    startDate: "",
    dueDate: "",
    estimatedCost: "",
    status: "Not started" as JobStatus,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.employeeId || !form.title || !form.dueDate) return;
        onSubmit(form);
      }}
    >
      <Field label="Assign to">
        <Select
          required
          value={form.employeeId}
          onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
        >
          <option value="">Select…</option>
          {employees.map((emp) => (
            <option key={emp.employee_id} value={emp.employee_id}>
              {emp.name} ({emp.role})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Title">
        <Input
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g. Site inspection"
        />
      </Field>
      <Field label="Description">
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <Field label="Due date">
        <Input
          required
          type="date"
          value={form.dueDate}
          onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
        />
      </Field>
      <Field label="Estimated cost (KSh)">
        <Input
          type="number"
          min={0}
          value={form.estimatedCost}
          onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })}
        />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Assign</Button>
      </div>
    </form>
  );
}
