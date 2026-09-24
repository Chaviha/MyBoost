import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MessageSquare,
  Plus,
  Save,
  Users,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Toolbar } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { Avatar } from "@/components/avatar";
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
import { Textarea } from "@/components/ui/textarea";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/meetings")({
  component: MeetingsPage,
});

type Participant = {
  user_id: string;
  name: string;
  email: string;
  avatar_url?: string;
};

type ActionItem = {
  text: string;
  done: boolean;
};

type Meeting = {
  meeting_id: string;
  organizer_user_id: string;
  organizer_name: string;
  organizer_email: string;
  title: string;
  agenda: string;
  start_at: string;
  duration_minutes: number;
  status: "Scheduled" | "In progress" | "Completed" | "Cancelled";
  meeting_url: string;
  notes: string;
  decisions: string;
  action_items: ActionItem[];
  participants: Participant[];
};

type Message = {
  message_id: string;
  body: string;
  created_at: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url?: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function toLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function MeetingsPage() {
  const { currentUser } = useLife();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);

  const selected = useMemo(
    () => meetings.find((meeting) => meeting.meeting_id === selectedId) ?? meetings[0],
    [meetings, selectedId],
  );

  async function loadMeetings(selectLatest = false) {
    try {
      const response = await fetch("/api/meetings", { credentials: "include", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load meetings");
      const next = Array.isArray(payload.meetings) ? payload.meetings : [];
      setMeetings(next);
      if (selectLatest && next[0]) setSelectedId(next[0].meeting_id);
      else if (!next.some((meeting: Meeting) => meeting.meeting_id === selectedId)) {
        setSelectedId(next[0]?.meeting_id ?? "");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load meetings");
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(meetingId: string) {
    if (!meetingId) {
      setMessages([]);
      return;
    }
    try {
      const response = await fetch(`/api/meetings/${meetingId}/messages`, { credentials: "include", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load discussion");
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load discussion");
    }
  }

  useEffect(() => {
    void loadMeetings();
  }, []);

  useEffect(() => {
    void loadMessages(selected?.meeting_id ?? "");
  }, [selected?.meeting_id]);

  async function updateMeeting(patch: Record<string, unknown>) {
    if (!selected) return;
    try {
      const response = await fetch(`/api/meetings/${selected.meeting_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update meeting");
      setMeetings((current) =>
        current.map((meeting) => meeting.meeting_id === selected.meeting_id ? payload.meeting : meeting),
      );
      toast.success("Meeting updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update meeting");
    }
  }

  async function sendMessage(body: string) {
    if (!selected || !body.trim()) return;
    try {
      const response = await fetch(`/api/meetings/${selected.meeting_id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to send message");
      setMessages((current) => [...current, payload.message]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send message");
    }
  }

  return (
    <>
      <Toolbar
        title="Meetings & discussions"
        subtitle="Schedule conversations with customers and professionals, meet by video, and keep the discussion, decisions, and action items together."
        actionLabel="New meeting"
        onAction={() => setOpenCreate(true)}
      />

      {loading ? (
        <Card className="p-6 text-sm text-ink-muted">Loading your meetings…</Card>
      ) : meetings.length === 0 ? (
        <EmptyState icon={Video} text="No meetings yet. Create a meeting and invite another LifeBoost user." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
          <Card className="h-fit overflow-hidden p-2">
            <div className="flex items-center gap-2 px-3 py-3">
              <CalendarDays className="size-4 text-forest" />
              <p className="font-medium">Your meetings</p>
            </div>
            <div className="space-y-1">
              {meetings.map((meeting) => (
                <button
                  type="button"
                  key={meeting.meeting_id}
                  onClick={() => setSelectedId(meeting.meeting_id)}
                  className={`w-full rounded-lg p-3 text-left ${selected?.meeting_id === meeting.meeting_id ? "bg-leaf" : "hover:bg-canvas"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{meeting.title}</p>
                    <StatusBadge status={meeting.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">{formatDate(meeting.start_at)}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {meeting.participants.length + 1} participant{meeting.participants.length + 1 === 1 ? "" : "s"}
                  </p>
                </button>
              ))}
            </div>
          </Card>

          {selected ? (
            <MeetingWorkspace
              meeting={selected}
              messages={messages}
              currentUserId={currentUser.user_id}
              onUpdate={updateMeeting}
              onSendMessage={sendMessage}
            />
          ) : null}
        </div>
      )}

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a LifeBoost meeting</DialogTitle>
          </DialogHeader>
          <CreateMeetingForm
            onCancel={() => setOpenCreate(false)}
            onCreated={(meeting) => {
              setMeetings((current) => [meeting, ...current]);
              setSelectedId(meeting.meeting_id);
              setOpenCreate(false);
              toast.success("Meeting created.");
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusBadge({ status }: { status: Meeting["status"] }) {
  const tone = status === "Completed" ? "forest" : status === "Cancelled" ? "amber" : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}

function MeetingWorkspace({
  meeting,
  messages,
  currentUserId,
  onUpdate,
  onSendMessage,
}: {
  meeting: Meeting;
  messages: Message[];
  currentUserId: string;
  onUpdate: (patch: Record<string, unknown>) => Promise<void>;
  onSendMessage: (body: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState(meeting.notes);
  const [decisions, setDecisions] = useState(meeting.decisions);
  const [actionText, setActionText] = useState(meeting.action_items.map((item) => `${item.done ? "[x]" : "[ ]"} ${item.text}`).join("\n"));
  const [message, setMessage] = useState("");

  useEffect(() => {
    setNotes(meeting.notes);
    setDecisions(meeting.decisions);
    setActionText(meeting.action_items.map((item) => `${item.done ? "[x]" : "[ ]"} ${item.text}`).join("\n"));
  }, [meeting.meeting_id, meeting.notes, meeting.decisions, meeting.action_items]);

  async function saveDiscussion() {
    const actionItems = actionText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const done = /^\[x\]\s*/i.test(line);
        return { done, text: line.replace(/^\[(x| )\]\s*/i, "") };
      })
      .filter((item) => item.text);
    await onUpdate({ notes, decisions, actionItems });
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    const body = message.trim();
    if (!body) return;
    await onSendMessage(body);
    setMessage("");
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-medium">{meeting.title}</h2>
              <StatusBadge status={meeting.status} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-1"><Clock3 className="size-4" />{formatDate(meeting.start_at)}</span>
              <span>{meeting.duration_minutes} minutes</span>
              <span>Organised by {meeting.organizer_name}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={meeting.meeting_url} target="_blank" rel="noreferrer">
                <Video className="size-4" /> Join video
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={meeting.meeting_url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" /> Open
              </a>
            </Button>
          </div>
        </div>
        {meeting.agenda ? (
          <div className="mt-5 rounded-lg bg-canvas p-4">
            <p className="text-xs font-medium tracking-[0.14em] text-ink-faint uppercase">Agenda</p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{meeting.agenda}</p>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Select
            value={meeting.status}
            onChange={(event) => void onUpdate({ status: event.target.value })}
            className="w-auto"
          >
            {["Scheduled", "In progress", "Completed", "Cancelled"].map((status) => <option key={status}>{status}</option>)}
          </Select>
          <Button variant="ghost" onClick={() => void onUpdate({ status: "In progress" })}>
            <Video className="size-4" /> Start discussion
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-forest" />
          <h3 className="font-medium">Participants</h3>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <ParticipantChip participant={{ user_id: meeting.organizer_user_id, name: meeting.organizer_name, email: meeting.organizer_email }} label="Organizer" />
          {meeting.participants.map((participant) => (
            <ParticipantChip key={participant.user_id} participant={participant} />
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">Meeting notes</h3>
            <Button size="sm" onClick={() => void saveDiscussion()}><Save className="size-4" /> Save</Button>
          </div>
          <Textarea className="mt-3 min-h-36" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Write notes while you meet…" />
          <div className="mt-5">
            <p className="font-medium">Decisions</p>
            <Textarea className="mt-2 min-h-28" value={decisions} onChange={(event) => setDecisions(event.target.value)} placeholder="Record decisions made in the meeting…" />
          </div>
          <div className="mt-5">
            <p className="font-medium">Action items</p>
            <Textarea
              className="mt-2 min-h-32"
              value={actionText}
              onChange={(event) => setActionText(event.target.value)}
              placeholder={"[ ] Follow up with customer\n[ ] Send quotation\n[x] Confirm meeting date"}
            />
            <p className="mt-1 text-xs text-ink-muted">Use one item per line. Start with [x] when completed.</p>
          </div>
        </Card>

        <Card className="flex min-h-[30rem] flex-col p-5">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-forest" />
            <h3 className="font-medium">Discussion</h3>
          </div>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="rounded-lg bg-canvas p-5 text-sm text-ink-muted">No discussion messages yet. Start the conversation here.</div>
            ) : messages.map((item) => (
              <div key={item.message_id} className="flex gap-3 rounded-lg bg-canvas p-3">
                <Avatar src={item.avatar_url} name={item.name} size="sm" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.user_id === currentUserId ? "You" : item.name}</p>
                    <span className="text-xs text-ink-faint">{formatDate(item.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
          <form className="mt-4 flex gap-2" onSubmit={submitMessage}>
            <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a message…" />
            <Button type="submit">Send</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function ParticipantChip({ participant, label }: { participant: Participant; label?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-2">
      <Avatar src={participant.avatar_url} name={participant.name} size="sm" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{participant.name}{label ? ` · ${label}` : ""}</p>
        <p className="text-xs text-ink-muted">{participant.email}</p>
      </div>
    </div>
  );
}

function CreateMeetingForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (meeting: Meeting) => void;
}) {
  const defaultStart = new Date(Date.now() + 60 * 60 * 1000);
  const localStart = toLocalInput(defaultStart.toISOString());
  const [form, setForm] = useState({
    title: "",
    agenda: "",
    startAt: localStart,
    durationMinutes: "60",
    participantEmails: "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const participantEmails = form.participantEmails
      .split(/[,\n;]/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (!form.title.trim() || !form.startAt) return;

    setSaving(true);
    try {
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: form.title,
          agenda: form.agenda,
          startAt: new Date(form.startAt).toISOString(),
          durationMinutes: Number(form.durationMinutes),
          participantEmails,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to create meeting");
      onCreated(payload.meeting);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create meeting");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Meeting title">
        <Input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Customer project discussion" />
      </Field>
      <Field label="Date and time">
        <Input required type="datetime-local" value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} />
      </Field>
      <Field label="Duration">
        <Select value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}>
          {[15, 30, 45, 60, 90, 120, 180].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
        </Select>
      </Field>
      <Field label="Invite LifeBoost users">
        <Textarea value={form.participantEmails} onChange={(event) => setForm({ ...form, participantEmails: event.target.value })} placeholder="Enter registered LifeBoost email addresses, separated by commas" />
      </Field>
      <Field label="Agenda">
        <Textarea value={form.agenda} onChange={(event) => setForm({ ...form, agenda: event.target.value })} placeholder="What do you want to discuss?" />
      </Field>
      <div className="mt-4 rounded-lg bg-canvas p-3 text-xs text-ink-muted">
        The video button uses a private, randomly generated Jitsi meeting room. Participants can join from the meeting page.
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving}><Plus className="size-4" />{saving ? "Creating…" : "Create meeting"}</Button>
      </div>
    </form>
  );
}
