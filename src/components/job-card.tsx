import { type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate, money } from "@/lib/format";
import type { Job, JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS: JobStatus[] = ["Not started", "In progress", "On hold", "Ready", "Completed"];

function tone(status: JobStatus) {
  if (status === "Completed" || status === "Ready") return "forest" as const;
  if (status === "In progress") return "amber" as const;
  if (status === "On hold") return "red" as const;
  return "neutral" as const;
}

export function JobProgress({ status }: { status: JobStatus }) {
  const idx = Math.max(
    0,
    STEPS.filter((s) => s !== "On hold").indexOf(status === "On hold" ? "In progress" : status),
  );
  const rail = STEPS.filter((s) => s !== "On hold");
  return (
    <div className="mt-3 flex items-center gap-1" aria-hidden>
      {rail.map((step, i) => (
        <span
          key={step}
          className={cn(
            "h-1.5 flex-1 rounded-full",
            i <= idx ? "bg-forest" : "bg-line",
          )}
        />
      ))}
    </div>
  );
}

export function JobCard({
  job,
  shop,
  person,
  overdue,
  actions,
}: {
  job: Job;
  shop?: string;
  person?: string;
  overdue?: boolean;
  actions?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {shop ? (
            <p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">{shop}</p>
          ) : null}
          <h3 className="mt-1 font-display text-lg font-medium tracking-tight">{job.title}</h3>
          {person ? <p className="text-sm text-ink-muted">{person}</p> : null}
        </div>
        <Badge tone={overdue && job.status !== "Completed" ? "red" : tone(job.status)}>
          {overdue && job.status !== "Completed" && job.status !== "Ready" ? "Overdue" : job.status}
        </Badge>
      </div>
      {job.description ? <p className="mt-2 text-sm text-ink-muted">{job.description}</p> : null}
      <p className="mt-2 text-xs text-ink-faint">
        Due {formatDate(job.due_date)} · {money(job.estimated_cost)}
      </p>
      <JobProgress status={job.status} />
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </Card>
  );
}
