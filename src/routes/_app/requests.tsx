import { createFileRoute } from "@tanstack/react-router";
import { Check, Inbox, Send, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Toolbar } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { ImagePicker, ImageStrip, SendRequestDialog } from "@/components/request-dialog";
import { SearchFilter } from "@/components/search-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, money } from "@/lib/format";
import { useLife } from "@/lib/store";
import {
  workApi,
  useWorkData,
  type PickedImage,
  type WorkRequest,
  type WorkRequestStatus,
  type WorkTarget,
} from "@/lib/work-api";

export const Route = createFileRoute("/_app/requests")({
  component: RequestsPage,
});

const EMPTY_REQUESTS: WorkRequest[] = [];
const EMPTY_TARGETS: WorkTarget[] = [];

function tone(status: WorkRequestStatus) {
  if (status === "Pending") return "amber" as const;
  if (status === "Rejected") return "red" as const;
  return "forest" as const;
}

function RequestsPage() {
  const { can, currentUser } = useLife();
  // Owners (and admins) receive requests; employees and customers send them.
  const isOwnerSide = can("approve_requests");
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const requests = useWorkData(workApi.requests, EMPTY_REQUESTS);
  const targets = useWorkData(workApi.targets, EMPTY_TARGETS, !isOwnerSide);

  // An owner only sees requests addressed to them; anything they sent themselves is excluded.
  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requests.data
      .filter((r) => (isOwnerSide ? r.owner_user_id === currentUser.user_id : r.from_user_id === currentUser.user_id))
      .filter(
        (r) =>
          !q ||
          `${r.kind} ${r.body} ${r.status} ${r.from_name} ${r.job_title} ${r.business_name}`.toLowerCase().includes(q),
      );
  }, [requests.data, searchQuery, isOwnerSide, currentUser.user_id]);

  return (
    <>
      <Toolbar
        title={isOwnerSide ? "Requests" : "My requests"}
        subtitle={
          isOwnerSide
            ? "Progress updates, questions and money requests from your employees and customers."
            : "Send progress updates, photos, questions or money requests to the business owner."
        }
        actionLabel={isOwnerSide ? undefined : "New request"}
        onAction={isOwnerSide ? undefined : () => setOpen(true)}
      />
      <SearchFilter onSearch={setSearchQuery} placeholder="Search requests…" />
      {requests.loading ? (
        <p className="text-sm text-ink-muted">Loading requests…</p>
      ) : requests.error ? (
        <Card className="p-5 text-sm">
          <p className="font-medium">Requests could not be loaded.</p>
          <p className="mt-1 text-ink-muted">{requests.error}</p>
          <Button className="mt-3" size="sm" onClick={() => void requests.reload()}>
            Try again
          </Button>
        </Card>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={isOwnerSide ? Inbox : Send}
          text={
            isOwnerSide
              ? "No requests from your employees or customers yet."
              : "No requests yet. Use New request to update the owner on your work."
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((request) => (
            <RequestCard
              key={request.request_id}
              request={request}
              isOwnerSide={isOwnerSide}
              onChange={requests.setData}
            />
          ))}
        </div>
      )}

      {!isOwnerSide ? (
        <SendRequestDialog
          open={open}
          onClose={() => setOpen(false)}
          targets={targets.data}
          onSent={requests.setData}
        />
      ) : null}
    </>
  );
}

function RequestCard({
  request,
  isOwnerSide,
  onChange,
}: {
  request: WorkRequest;
  isOwnerSide: boolean;
  onChange: (requests: WorkRequest[]) => void;
}) {
  const [reply, setReply] = useState("");
  const [images, setImages] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const isMoney = request.kind === "Money";

  async function decide(status: Exclude<WorkRequestStatus, "Pending">) {
    setBusy(true);
    try {
      onChange(await workApi.decide(request.request_id, status));
      toast.success(`Request ${status.toLowerCase()}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the request.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!reply.trim() && images.length === 0) return;
    setBusy(true);
    try {
      onChange(await workApi.reply(request.request_id, reply.trim(), images));
      setReply("");
      setImages([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-2 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-forest uppercase">{request.business_name}</p>
          <p className="mt-0.5 font-medium">
            {request.kind}
            {request.job_title ? ` · ${request.job_title}` : ""}
          </p>
        </div>
        <Badge tone={tone(request.status)}>{request.status}</Badge>
      </div>
      {isMoney ? (
        <p className="font-display text-2xl font-medium tabular-nums">{money(request.amount)}</p>
      ) : null}
      {request.body ? <p className="text-sm whitespace-pre-wrap text-ink-muted">{request.body}</p> : null}
      <ImageStrip images={request.images} />
      <p className="text-xs text-ink-faint">
        {isOwnerSide ? `From ${request.from_name} (${request.from_role})` : `To ${request.owner_name}`} ·{" "}
        {formatDateTime(request.created_at)}
      </p>

      {request.messages.length ? (
        <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
          {request.messages.map((m) => (
            <div key={m.message_id} className="rounded-lg bg-canvas px-3 py-2">
              <p className="text-xs font-medium text-ink">
                {m.user_name} <span className="font-normal text-ink-faint">· {formatDateTime(m.created_at)}</span>
              </p>
              {m.body ? <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink-muted">{m.body}</p> : null}
              <ImageStrip images={m.images} />
            </div>
          ))}
        </div>
      ) : null}

      {isOwnerSide && request.status === "Pending" ? (
        <div className="mt-1 flex flex-wrap gap-2">
          {isMoney ? (
            <>
              <Button size="sm" disabled={busy} onClick={() => void decide("Approved")}>
                <Check className="size-3.5" />
                Approve
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void decide("Rejected")}>
                <X className="size-3.5" />
                Reject
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => void decide("Acknowledged")}>
              <Check className="size-3.5" />
              Acknowledge
            </Button>
          )}
        </div>
      ) : null}

      <div className="mt-1 border-t border-line pt-3">
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder={isOwnerSide ? "Reply…" : "Add more progress or a reply…"}
          className="min-h-16"
        />
        <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
          <ImagePicker images={images} onChange={setImages} />
          <Button size="sm" disabled={busy || (!reply.trim() && images.length === 0)} onClick={() => void send()}>
            Send
          </Button>
        </div>
      </div>
    </Card>
  );
}
