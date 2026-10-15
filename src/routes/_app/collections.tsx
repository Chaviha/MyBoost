import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, MessageSquare, Save, Users, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/format";
import type { CustomerStatus } from "@/lib/types";
import { SearchFilter } from "@/components/search-filter";
import { Select } from "@/components/ui/select";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/collections")({
  component: CollectionsPage,
});

function toneFor(status: CustomerStatus) {
  if (status === "Overdue") return "red" as const;
  if (status === "Due soon") return "amber" as const;
  if (status === "Paid") return "forest" as const;
  return "neutral" as const;
}

function CollectionsPage() {
  const { allCustomers, visibleBusinesses, totalOutstanding, totalOverdue, can } = useLife();
  const [searchQuery, setSearchQuery] = useState("");
  const [channel, setChannel] = useState("lifeboost");
  const [reminderTiming, setReminderTiming] = useState("before");
  const [reminderDays, setReminderDays] = useState("3");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/collections/settings", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not load reminder preferences");
        if (!active) return;
        const settings = payload.settings || {};
        setChannel(settings.channel || "lifeboost");
        setReminderTiming(settings.timing || "before");
        setReminderDays(String(settings.days || 3));
      })
      .catch(() => {
        if (active) toast.message("Reminder preferences will use defaults until they can be loaded.");
      })
      .finally(() => { if (active) setSettingsLoaded(true); });
    return () => { active = false; };
  }, []);

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const response = await fetch("/api/collections/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, timing: reminderTiming, days: Number(reminderDays) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save reminder preferences");
      toast.success("Smart Collection preferences saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save reminder preferences");
    } finally {
      setSavingSettings(false);
    }
  }

  async function sendReminder(customer: (typeof allCustomers)[number]) {
    try {
      const response = await fetch(`/api/collections/${encodeURIComponent(customer.customer_id)}/remind`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not send reminder");
      if (payload.notificationCreated) toast.success(`LifeBoost notification sent to ${customer.name}.`);
      if (payload.whatsapp?.url) {
        window.open(payload.whatsapp.url, "_blank", "noopener,noreferrer");
        toast.message("WhatsApp opened with the reminder prepared. Review and send it in WhatsApp.");
      }
      if (!payload.notificationCreated && !payload.whatsapp?.url) toast.message("No notification channel was selected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send reminder");
    }
  }

  if (!can("view_collections")) {
    return <AccessDenied need="Smart collections are for owners and admins." />;
  }

  const nameOf = (id: string) =>
    visibleBusinesses.find((b) => b.business_id === id)?.business_name ?? "—";

  const steps = [
    "Invoice created",
    "Reminder before due date",
    "Reminder on due date",
    "Overdue follow-up",
    "Payment recorded",
  ];

  return (
    <>
      <PageHeader
        title="Smart collections"
        subtitle="LifeBoost follows up with customers so you don't have to."
      />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard title="Total outstanding" value={money(totalOutstanding)} icon={Wallet} />
        <MetricCard title="Overdue" value={money(totalOverdue)} icon={AlertTriangle} tone="red" />
        <MetricCard title="Customers tracked" value={allCustomers.length} icon={Users} />
      </div>
      <Card className="mb-4 p-5">
        <p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">
          Automatic reminders
        </p>
        <h2 className="mt-1 font-display text-xl font-medium tracking-tight">
          Collect while you run the business.
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Scheduled LifeBoost reminders reach linked customers. WhatsApp reminders open a prepared chat for you to review and send.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {steps.map((step, i) => (
            <div key={step} className="flex items-start gap-2 rounded-md bg-canvas px-3 py-2 text-xs">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-leaf text-[10px] font-medium text-forest">
                {i + 1}
              </span>
              {step}
            </div>
          ))}
        </div>
      </Card>
      <Card className="mb-4 p-5">
        <h3 className="font-medium">Reminder preferences</h3>
        <p className="mt-1 text-sm text-ink-muted">Choose the delivery channel and schedule for collection reminders.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">Notification channel
            <Select value={channel} onChange={(event) => setChannel(event.target.value)}>
              <option value="lifeboost">LifeBoost notification</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="both">WhatsApp + LifeBoost</option>
            </Select>
          </label>
          <label className="grid gap-1 text-sm">When to remind
            <Select value={reminderTiming} onChange={(event) => setReminderTiming(event.target.value)}>
              <option value="before">Before due date</option>
              <option value="due">On due date</option>
              <option value="overdue">After overdue</option>
            </Select>
          </label>
          <label className="grid gap-1 text-sm">Days before / after
            <Select value={reminderDays} onChange={(event) => setReminderDays(event.target.value)}>
              {[1,3,7,14].map((day) => <option key={day} value={String(day)}>{day} day{day === 1 ? "" : "s"}</option>)}
            </Select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">The schedule sends in-app reminders to linked LifeBoost customers. WhatsApp opens a prepared chat when you click Send; fully automatic WhatsApp delivery requires WhatsApp Business API credentials.</p>
          <Button size="sm" onClick={() => void saveSettings()} disabled={savingSettings || !settingsLoaded}>
            <Save className="size-3.5" /> {savingSettings ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </Card>
      <SearchFilter onSearch={setSearchQuery} placeholder="Search customers, amounts, status…" />
      <Card className="overflow-hidden p-0">
        {allCustomers.filter((customer) => `${customer.name} ${customer.phone} ${customer.status} ${customer.customer_id}`.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
          <EmptyState icon={Users} text="No customers to track yet." compact />
        ) : (
          allCustomers.filter((customer) => `${customer.name} ${customer.phone} ${customer.status} ${customer.customer_id}`.toLowerCase().includes(searchQuery.toLowerCase())).map((customer) => (
            <div
              key={customer.customer_id}
              className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{customer.name}</p>
                <p className="text-xs text-ink-muted">{customer.phone}</p>
              </div>
              <span className="text-sm text-ink-muted">{nameOf(customer.business_id)}</span>
              <strong className="text-sm tabular-nums">{money(customer.amount)}</strong>
              <Badge tone={toneFor(customer.status)}>{customer.status}</Badge>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void sendReminder(customer)}
              >
                <MessageSquare className="size-3.5" />
                Send
              </Button>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
