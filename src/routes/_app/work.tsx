import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, ClipboardList, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { JobCard } from "@/components/job-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/format";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/work")({
  component: WorkPage,
});

function WorkPage() {
  const { myJobs, updateJobStatus, state, workspace } = useLife();
  const upcoming = [...myJobs].sort((a, b) => +new Date(a.due_date) - +new Date(b.due_date));
  const deadlines = upcoming.filter((j) => j.status !== "Completed");

  function shopOf(id: string) {
    return state.businesses.find((b) => b.business_id === id)?.business_name ?? "Business";
  }

  function actions(job: (typeof myJobs)[number]) {
    return job.status !== "Ready" && job.status !== "Completed" ? (
      <Button
        size="sm"
        onClick={() => {
          updateJobStatus(job.job_id, "Ready");
          toast.success("Marked ready.");
        }}
      >
        Mark ready
      </Button>
    ) : job.status === "Ready" ? (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          updateJobStatus(job.job_id, "In progress");
          toast.success("Marked not ready.");
        }}
      >
        Mark not ready
      </Button>
    ) : null;
  }

  return (
    <>
      <PageHeader
        eyebrow="Professional"
        title="My jobs"
        subtitle={
          workspace === "employee"
            ? "Mark work ready when it is done. The owner sees the same status."
            : "Jobs assigned to you show here."
        }
      />
      {upcoming.length === 0 ? (
        <EmptyState icon={ClipboardList} text="No jobs assigned to you yet." />
      ) : (
        <Tabs defaultValue="jobs">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="jobs">My jobs</TabsTrigger>
            <TabsTrigger value="deadlines">Deadlines</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
          </TabsList>
          <TabsContent value="jobs">
            <div className="flex flex-col gap-3">
              {upcoming.map((job) => (
                <JobCard
                  key={job.job_id}
                  job={job}
                  shop={shopOf(job.business_id)}
                  overdue={+new Date(job.due_date) < +new Date("2026-08-31")}
                  actions={actions(job)}
                />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="deadlines">
            {deadlines.length === 0 ? (
              <EmptyState icon={CalendarClock} text="No open deadlines." compact />
            ) : (
              <div className="flex flex-col gap-3">
                {deadlines.map((job) => (
                  <JobCard
                    key={job.job_id}
                    job={job}
                    shop={`${shopOf(job.business_id)} · due ${formatDate(job.due_date)}`}
                    overdue={+new Date(job.due_date) < +new Date("2026-08-31")}
                    actions={actions(job)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="progress">
            <div className="flex flex-col gap-3">
              {upcoming.length === 0 ? (
                <EmptyState icon={ListChecks} text="No progress to show." compact />
              ) : (
                upcoming.map((job) => (
                  <JobCard
                    key={job.job_id}
                    job={job}
                    shop={shopOf(job.business_id)}
                    overdue={+new Date(job.due_date) < +new Date("2026-08-31")}
                  />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
