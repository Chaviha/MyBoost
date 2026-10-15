import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, ClipboardList, ListChecks, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { JobCard } from "@/components/job-card";
import { PageHeader } from "@/components/page-header";
import { SendRequestDialog } from "@/components/request-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/format";
import type { JobStatus } from "@/lib/types";
import { workApi, useWorkData, type WorkJob, type WorkTarget } from "@/lib/work-api";

export const Route = createFileRoute("/_app/work")({
  component: WorkPage,
});

const NO_JOBS: WorkJob[] = [];
const NO_TARGETS: WorkTarget[] = [];

function WorkPage() {
  // Jobs live in the owner's records, so they are loaded from the server for the signed-in employee.
  const jobsData = useWorkData(workApi.jobs, NO_JOBS);
  const targets = useWorkData(workApi.targets, NO_TARGETS);
  const [sendFor, setSendFor] = useState<WorkJob | null>(null);
  const [busyJob, setBusyJob] = useState<string | null>(null);

  const myJobs = jobsData.data.filter((j) => j.role === "employee");
  const upcoming = [...myJobs].sort((a, b) => +new Date(a.due_date) - +new Date(b.due_date));
  const deadlines = upcoming.filter((j) => j.status !== "Completed");
  const now = Date.now();
  const isOverdue = (j: WorkJob) => j.status !== "Completed" && +new Date(j.due_date) < now;

  async function setStatus(job: WorkJob, status: JobStatus) {
    setBusyJob(job.job_id);
    try {
      const updated = await workApi.setJobStatus(job.job_id, status);
      jobsData.setData(jobsData.data.map((j) => (j.job_id === updated.job_id ? updated : j)));
      toast.success(status === "Ready" ? "Marked ready. The owner can see it." : `Status: ${status}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the job.");
    } finally {
      setBusyJob(null);
    }
  }

  function actions(job: WorkJob) {
    const busy = busyJob === job.job_id;
    return (
      <>
        {job.status === "Not started" || job.status === "On hold" ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void setStatus(job, "In progress")}>
            Start work
          </Button>
        ) : null}
        {job.status === "In progress" ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void setStatus(job, "On hold")}>
            Put on hold
          </Button>
        ) : null}
        {job.status !== "Ready" && job.status !== "Completed" ? (
          <Button size="sm" disabled={busy} onClick={() => void setStatus(job, "Ready")}>
            Mark ready
          </Button>
        ) : null}
        {job.status === "Ready" ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void setStatus(job, "In progress")}>
            Mark not ready
          </Button>
        ) : null}
        {job.status !== "Completed" ? (
          <Button size="sm" variant="outline" onClick={() => setSendFor(job)}>
            <Send className="size-3.5" />
            Send update
          </Button>
        ) : null}
      </>
    );
  }

  const card = (job: WorkJob, withDue = false) => (
    <JobCard
      key={job.job_id}
      job={{ ...job, employee_id: "", customer_id: "" }}
      shop={withDue ? `${job.business_name} · due ${formatDate(job.due_date)}` : job.business_name}
      overdue={isOverdue(job)}
      actions={actions(job)}
    />
  );

  return (
    <>
      <PageHeader
        eyebrow="Professional"
        title="My jobs"
        subtitle="Jobs the business owner assigned to you, with their live status. Send progress photos and notes to the owner."
      />
      {jobsData.loading ? (
        <p className="text-sm text-ink-muted">Loading your jobs…</p>
      ) : jobsData.error ? (
        <EmptyState icon={ClipboardList} text={`Could not load your jobs. ${jobsData.error}`} />
      ) : upcoming.length === 0 ? (
        <EmptyState icon={ClipboardList} text="No jobs assigned to you yet." />
      ) : (
        <Tabs defaultValue="jobs">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="jobs">My jobs</TabsTrigger>
            <TabsTrigger value="deadlines">Deadlines</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
          </TabsList>
          <TabsContent value="jobs">
            <div className="flex flex-col gap-3">{upcoming.map((job) => card(job))}</div>
          </TabsContent>
          <TabsContent value="deadlines">
            {deadlines.length === 0 ? (
              <EmptyState icon={CalendarClock} text="No open deadlines." compact />
            ) : (
              <div className="flex flex-col gap-3">{deadlines.map((job) => card(job, true))}</div>
            )}
          </TabsContent>
          <TabsContent value="progress">
            {upcoming.length === 0 ? (
              <EmptyState icon={ListChecks} text="No progress to show." compact />
            ) : (
              <div className="flex flex-col gap-3">
                {upcoming.map((job) => (
                  <JobCard
                    key={job.job_id}
                    job={{ ...job, employee_id: "", customer_id: "" }}
                    shop={job.business_name}
                    overdue={isOverdue(job)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <SendRequestDialog
        open={Boolean(sendFor)}
        onClose={() => setSendFor(null)}
        targets={targets.data.filter((t) => t.role === "employee")}
        businessId={sendFor?.business_id}
        jobId={sendFor?.job_id}
        defaultKind="Progress update"
      />
    </>
  );
}
