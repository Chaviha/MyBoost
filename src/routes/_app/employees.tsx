import { createFileRoute } from "@tanstack/react-router";
import {
  BriefcaseBusiness,
  Download,
  FileText,
  ImagePlus,
  Pencil,
  Printer,
  Search,
  Store,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { MoreActions } from "@/components/more-actions";
import { Toolbar } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { ListingCover } from "@/components/listing-cover";
import { MediaManagerDialog, MediaPicker } from "@/components/media-manager";
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
import type { StagedMedia } from "@/lib/media";
import {
  downloadPageBrochure,
  printPageBrochure,
  type BrochureItem,
} from "@/lib/page-brochure";
import { useLife } from "@/lib/store";
import type { Employee } from "@/lib/types";

export const Route = createFileRoute("/_app/employees")({
  component: EmployeesPage,
});

function EmployeesPage() {
  const {
    selectedBusiness,
    businessEmployees,
    addEmployee,
    refreshPublicMarketplace,
    can,
    updateEmployee,
    deleteEmployee,
    uploadEmployeeMedia,
    removeEmployeeMedia,
    currentUser,
  } = useLife() as ReturnType<typeof useLife> & {
    uploadEmployeeMedia: (
      employeeId: string,
      files: StagedMedia[],
    ) => Promise<void>;
    removeEmployeeMedia: (employeeId: string, mediaId: string) => Promise<void>;
  };

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [mediaFor, setMediaFor] = useState<Employee | null>(null);

  if (!can("manage_employees")) {
    return (
      <AccessDenied need="The team list is only available to owners and admins." />
    );
  }
  if (!selectedBusiness) {
    return <EmptyState icon={BriefcaseBusiness} text="Add a business first." />;
  }

  const filtered = businessEmployees.filter((e) =>
    `${e.name} ${e.role} ${e.phone}`.toLowerCase().includes(q.toLowerCase()),
  );

  const [brochureBusy, setBrochureBusy] = useState(false);

  function employeeToItem(e: Employee): BrochureItem {
    const specs: Record<string, string | number> = {};
    if (e.role) specs.Role = e.role;
    if (e.job_status) specs.Status = e.job_status;
    if (e.listed) specs.Marketplace = e.listed ? "Listed" : "Private";
    if (e.location) specs.Location = e.location;
    return {
      name: e.name || "Professional",
      type: e.role || "Professional",
      description: e.notes || "",
      image_url: e.image_url || "",
      gallery: Array.isArray(e.gallery)
        ? e.gallery.map((m) => ({
            url: m.url,
            name: m.name,
            media_type: m.media_type,
          }))
        : [],
      specs,
      location: e.location || "",
      phone: e.phone || "",
      email: e.email || "",
      contact_name: e.name || "",
    };
  }

  async function runBrochure(
    list: Employee[],
    mode: "print" | "download",
    title?: string,
  ) {
    if (!list.length) {
      toast.message("No professionals to include in the brochure.");
      return;
    }
    setBrochureBusy(true);
    try {
      toast.message("Preparing brochure images…");
      const items = list.map(employeeToItem);
      const meta = {
        title:
          title ||
          `${selectedBusiness?.business_name || "Team"} — Professionals`,
        preparedBy: currentUser?.name || "",
        phone: currentUser?.phone || selectedBusiness?.phone || "",
        email: currentUser?.email || selectedBusiness?.email || "",
      };
      if (mode === "print") {
        await printPageBrochure(items, meta);
        toast.success("Brochure opened — use Print → Save as PDF.");
      } else {
        await downloadPageBrochure(items, meta);
        toast.success("Brochure downloaded.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create brochure.");
    } finally {
      setBrochureBusy(false);
    }
  }

  return (
    <>
      <Toolbar
        title="Professionals"
        subtitle={`Team at ${selectedBusiness.business_name} — photos, bio & brochure download`}
        actionLabel="Add professional"
        onAction={() => {
          setEditing(null);
          setOpen(true);
        }}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
          <Input
            className="pl-9"
            placeholder="Search professionals…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={brochureBusy || filtered.length === 0}
            onClick={() => void runBrochure(filtered, "print")}
          >
            <Printer className="size-3.5" />
            Brochure PDF
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={brochureBusy || filtered.length === 0}
            onClick={() => void runBrochure(filtered, "download")}
          >
            <Download className="size-3.5" />
            Download
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={BriefcaseBusiness} text="No professionals yet." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((employee) => (
            <Card key={employee.employee_id} className="overflow-hidden p-0">
              <ListingCover
                src={employee.image_url}
                alt={employee.name}
                type="Other"
                className="h-36"
              />
              <div className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg font-medium">{employee.name}</h3>
                    <p className="text-sm text-ink-muted">{employee.role}</p>
                  </div>
                  {employee.listed ? (
                    <Badge tone="forest">
                      <Store className="size-3" />
                      Listed
                    </Badge>
                  ) : null}
                </div>
                {employee.notes ? (
                  <p className="line-clamp-2 text-sm text-ink-muted">{employee.notes}</p>
                ) : null}
                <div className="flex flex-wrap gap-2 text-xs text-ink-muted">
                  {employee.phone ? <span>{employee.phone}</span> : null}
                  {employee.location ? <span>{employee.location}</span> : null}
                  {employee.gallery?.length ? (
                    <span>{employee.gallery.length} photo(s)</span>
                  ) : null}
                </div>
                <div className="mt-1 flex justify-end">
                  <MoreActions
                    actions={[
                      {
                        label: "Edit",
                        icon: <Pencil className="size-4" />,
                        onSelect: () => {
                          setEditing(employee);
                          setOpen(true);
                        },
                      },
                      {
                        label: "Photos & videos",
                        icon: <ImagePlus className="size-4" />,
                        onSelect: () => setMediaFor(employee),
                      },
                      {
                        label: "Brochure",
                        icon: <FileText className="size-4" />,
                        onSelect: () => {
                          void runBrochure([employee], "print", employee.name);
                        },
                      },
                      {
                        label: "Delete",
                        destructive: true,
                        icon: <Trash2 className="size-4" />,
                        onSelect: () => {
                          if (!window.confirm(`Remove ${employee.name}?`)) return;
                          deleteEmployee(employee.employee_id);
                          void refreshPublicMarketplace();
                          toast.success("Professional removed.");
                        },
                      },
                    ]}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            setOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit professional" : "Add professional"}
            </DialogTitle>
          </DialogHeader>
          <EmployeeForm
            key={editing?.employee_id || "new"}
            initial={editing}
            onCancel={() => {
              setOpen(false);
              setEditing(null);
            }}
            onSubmit={async (form) => {
              try {
                if (editing) {
                  updateEmployee(editing.employee_id, {
                    name: form.name,
                    phone: form.phone,
                    email: form.email,
                    role: form.role,
                    job_status: form.jobStatus,
                    listed: form.listed,
                    location: form.location,
                    notes: form.notes,
                  });
                  if (form.media.length) {
                    await uploadEmployeeMedia(editing.employee_id, form.media);
                  }
                  await refreshPublicMarketplace();
                  toast.success(
                    form.listed
                      ? `${form.name} updated and listed on the marketplace.`
                      : `${form.name} updated.`,
                  );
                } else {
                  const employeeId = await addEmployee({
                    name: form.name,
                    phone: form.phone,
                    email: form.email,
                    role: form.role,
                    jobStatus: form.jobStatus,
                    listed: form.listed,
                    location: form.location,
                    notes: form.notes,
                  });
                  if (form.media.length && employeeId) {
                    await uploadEmployeeMedia(String(employeeId), form.media);
                  }
                  await refreshPublicMarketplace();
                  toast.success(
                    form.listed
                      ? `${form.name} added and listed on the marketplace.`
                      : `${form.name} added.`,
                  );
                }
                setOpen(false);
                setEditing(null);
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Unable to save professional.",
                );
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <MediaManagerDialog
        open={Boolean(mediaFor)}
        onClose={() => setMediaFor(null)}
        title={
          mediaFor
            ? `${mediaFor.name}: photos & videos`
            : "Professional photos & videos"
        }
        gallery={mediaFor?.gallery || []}
        coverUrl={mediaFor?.image_url}
        onUpload={async (files) => {
          if (!mediaFor) return;
          await uploadEmployeeMedia(mediaFor.employee_id, files);
          toast.success("Photos updated.");
          await refreshPublicMarketplace();
        }}
        onRemove={async (mediaId) => {
          if (!mediaFor) return;
          await removeEmployeeMedia(mediaFor.employee_id, mediaId);
          toast.success("File removed.");
          await refreshPublicMarketplace();
        }}
      />
    </>
  );
}

function EmployeeForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial?: Employee | null;
  onCancel: () => void;
  onSubmit: (form: {
    name: string;
    phone: string;
    email: string;
    role: string;
    jobStatus: string;
    listed: boolean;
    location: string;
    notes: string;
    media: StagedMedia[];
  }) => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    phone: initial?.phone || "",
    email: initial?.email || "",
    role: initial?.role || "",
    jobStatus: initial?.job_status || "Active",
    listed: Boolean(initial?.listed),
    location: initial?.location || "",
    notes: initial?.notes || "",
  });
  const [media, setMedia] = useState<StagedMedia[]>([]);
  const [saving, setSaving] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!form.name || !form.role) return;
        setSaving(true);
        try {
          await onSubmit({ ...form, media });
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Name">
        <Input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>
      <Field label="Role / service">
        <Input
          required
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          placeholder="Plumber / Welder / Engineer / Manager"
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
        <Input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
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
      <Field label="Bio / service description" hint="(optional)">
        <Input
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Short description of services offered"
        />
      </Field>

      <MediaPicker
        label="Photos & videos"
        hint="First photo becomes the cover on the marketplace. Up to 10 files — images up to 6MB, videos up to 40MB."
        value={media}
        onChange={setMedia}
      />

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
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : initial ? "Save changes" : "Add professional"}
        </Button>
      </div>
    </form>
  );
}
