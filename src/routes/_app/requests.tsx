import { createFileRoute } from "@tanstack/react-router";
import { Check, CreditCard, ImagePlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/format";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/requests")({
  component: RequestsPage,
});

function RequestsPage() {
  const { selectedBusiness, businessRequests, addRequest, decideRequest, uploadRequestPictures, can, state } =
    useLife();
  const [open, setOpen] = useState(false);
  const canApprove = can("approve_requests");

  const title = canApprove ? "Requests" : "My requests";
  const subtitle = canApprove
    ? `Money requests for ${selectedBusiness?.business_name ?? "your businesses"}`
    : "Submit and track money requests to your employer.";

  return (
    <>
      <Toolbar
        title={title}
        subtitle={subtitle}
        actionLabel="New request"
        onAction={() => setOpen(true)}
      />
      {businessRequests.length === 0 ? (
        <EmptyState icon={CreditCard} text="No requests yet." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {businessRequests.map((request) => {
            const who =
              state.users.find((u) => u.user_id === request.user_id)?.name ?? request.user_id;
            const tone =
              request.status === "Pending"
                ? "amber"
                : request.status === "Approved"
                  ? "forest"
                  : "red";
            return (
              <Card key={request.request_id} className="flex flex-col gap-2 p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{request.type}</p>
                  <Badge tone={tone}>{request.status}</Badge>
                </div>
                <p className="font-display text-2xl font-medium tabular-nums">
                  {money(request.amount)}
                </p>
                <p className="text-sm text-ink-muted">{request.reason}</p>
                <p className="text-xs text-ink-faint">Requested by {who}</p>
                {(request.pictures || []).length > 0 ? (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {request.pictures.map((pic) => (
                      <img
                        key={pic.name}
                        src={pic.data_url}
                        alt={pic.name}
                        className="h-16 w-16 rounded-sm object-cover shadow-border"
                      />
                    ))}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {!canApprove ? (
                    <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm bg-paper px-3 text-sm shadow-border">
                      <ImagePlus className="size-3.5" />
                      Invoice photo
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []).slice(0, 5);
                          if (!files.length) return;
                          Promise.all(
                            files.map(
                              (file) =>
                                new Promise<{ name: string; data_url: string }>((resolve, reject) => {
                                  const reader = new FileReader();
                                  reader.onload = () =>
                                    resolve({
                                      name: file.name,
                                      data_url: String(reader.result),
                                    });
                                  reader.onerror = () => reject(new Error("read"));
                                  reader.readAsDataURL(file);
                                }),
                            ),
                          ).then((pics) => {
                            uploadRequestPictures(request.request_id, pics);
                            toast.success("Invoice pictures attached.");
                          });
                          e.target.value = "";
                        }}
                      />
                    </label>
                  ) : null}
                  {canApprove && request.status === "Pending" ? (
                    <>
                    <Button
                      size="sm"
                      onClick={() => {
                        decideRequest(request.request_id, "Approved");
                        toast.success("Request approved.");
                      }}
                    >
                      <Check className="size-3.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        decideRequest(request.request_id, "Rejected");
                        toast.message("Request rejected.");
                      }}
                    >
                      <X className="size-3.5" />
                      Reject
                    </Button>
                    </>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New money request</DialogTitle>
          </DialogHeader>
          <RequestForm
            onCancel={() => setOpen(false)}
            onSubmit={(form) => {
              addRequest(form);
              toast.success("Request submitted for approval.");
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function RequestForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (form: { type: string; amount: string; reason: string }) => void;
}) {
  const [form, setForm] = useState({ type: "Transport", amount: "", reason: "" });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.amount || !form.reason) return;
        onSubmit(form);
      }}
    >
      <Field label="Request type">
        <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {["Transport", "Materials", "Allowance", "Reimbursement", "Other"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
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
      <Field label="Reason">
        <Textarea
          required
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Submit request</Button>
      </div>
    </form>
  );
}
