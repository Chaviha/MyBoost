import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, ClipboardCheck } from "lucide-react";
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
  const {
    selectedBusiness, businessJobs, businessEmployees, addJob, updateJobStatus,
    recordJobActuals, can, state,
  } = useLife();
  const [open, setOpen] = useState(false);
  const [usageJobId, setUsageJobId] = useState<string | null>(null);

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
              <div key={job.job_id} className="space-y-1">
              <JobCard
                key={job.job_id}
                job={job}
                person={`${emp?.name ?? "Unassigned"}${customer ? ` · ${customer.name}` : ""}`}
                overdue={+new Date(job.due_date) < +new Date()}
                actions={
                  <div className="flex items-center gap-2">
                    {(job.planned_resources?.length || job.actual_resources?.length) ? (
                      <Button size="sm" variant="secondary" onClick={() => setUsageJobId(job.job_id)}>
                        <ClipboardCheck className="size-3.5" /> Usage
                      </Button>
                    ) : null}
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
                  </div>
                }
              />
              {(job.actual_resources?.length || job.planned_resources?.length) ? (
                <p className="px-2 text-xs text-ink-muted">
                  Planned {job.planned_resources?.reduce((s, r) => s + Number(r.amount || 0), 0).toLocaleString()} ·
                  Actual {job.actual_resources?.reduce((s, r) => s + Number(r.amount || 0), 0).toLocaleString()}
                  {job.variance_reason ? ` · ${job.variance_reason}` : ""}
                </p>
              ) : null}
              </div>
            );
          })}
        </div>
      )}
      <Dialog open={Boolean(usageJobId)} onOpenChange={(v) => !v && setUsageJobId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Planned vs actual usage</DialogTitle></DialogHeader>
          {(() => {
            const job = businessJobs.find((j) => j.job_id === usageJobId);
            if (!job) return null;
            return <JobUsageForm
              job={job}
              onCancel={() => setUsageJobId(null)}
              onSave={(resources, reason) => {
                recordJobActuals(job.job_id, resources, reason);
                toast.success("Actual usage recorded.");
                setUsageJobId(null);
              }}
            />;
          })()}
        </DialogContent>
      </Dialog>
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

function JobUsageForm({ job, onCancel, onSave }: {
  job: import("@/lib/types").Job;
  onCancel: () => void;
  onSave: (resources: import("@/lib/types").JobResourceUsage[], reason: string) => void;
}) {
  const planned = job.planned_resources || [];
  const [rows, setRows] = useState(() => planned.map((r) => ({ ...r, qty: r.qty, rate: r.rate })));
  const [reason, setReason] = useState(job.variance_reason || "");
  return (
    <div className="space-y-3">
      {rows.length === 0 ? <p className="text-sm text-ink-muted">This job has no planned resources yet. Convert an accepted quotation into a job to carry its material plan automatically.</p> : null}
      {rows.map((r, i) => (
        <div key={r.resource_id} className="rounded-lg border border-line p-3">
          <p className="mb-2 text-sm font-medium">{r.description} <span className="text-xs text-ink-muted">({r.unit})</span></p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Actual quantity"><Input type="number" step="any" value={r.qty} onChange={(e) => setRows((x) => x.map((row, n) => n === i ? { ...row, qty: Number(e.target.value) } : row))} /></Field>
            <Field label="Actual rate"><Input type="number" step="any" value={r.rate} onChange={(e) => setRows((x) => x.map((row, n) => n === i ? { ...row, rate: Number(e.target.value) } : row))} /></Field>
          </div>
          <p className="text-xs text-ink-muted">Actual amount: KSh {(Number(r.qty || 0) * Number(r.rate || 0)).toLocaleString()}</p>
        </div>
      ))}
      <Field label="Variance reason" hint="optional">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Material wastage, design modification, rework, customer change…" />
      </Field>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button onClick={() => onSave(rows.map((r) => ({ ...r, amount: Number(r.qty || 0) * Number(r.rate || 0) })), reason)}>Save actuals</Button></div>
    </div>
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
