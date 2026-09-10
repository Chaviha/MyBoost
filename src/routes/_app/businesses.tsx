import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, ImagePlus, MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { Toolbar } from "@/components/app-shell";
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
import { money } from "@/lib/format";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/businesses")({
  component: BusinessesPage,
});

function BusinessesPage() {
  const {
    visibleBusinesses,
    addBusiness,
    uploadBusinessMedia,
    removeBusinessMedia,
    reorderBusinessMedia,
    setSelectedBusinessId,
    refreshPublicMarketplace,
    can,
  } = useLife();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mediaForId, setMediaForId] = useState<string | null>(null);
  const mediaFor = visibleBusinesses.find((b) => b.business_id === mediaForId) || null;

  if (!can("manage_own_businesses")) {
    return <AccessDenied need="Only owners and admins can manage businesses." />;
  }

  return (
    <>
      <Toolbar
        title="My businesses"
        subtitle="Manage every business from one LifeBoost account."
        actionLabel="Add business"
        onAction={() => setOpen(true)}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {visibleBusinesses.map((b) => (
          <Card key={b.business_id} className="overflow-hidden p-0">
            <ListingCover
              src={b.image_url}
              alt={b.business_name}
              type={b.business_type}
              className="h-32"
            />
            <div className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">
                {b.business_type}
              </p>
              <Badge tone="forest">{b.listed ? "Listed" : b.status}</Badge>
            </div>
            <h3 className="font-display text-xl font-medium tracking-tight">{b.business_name}</h3>
            {b.tagline ? <p className="text-sm text-ink-muted">{b.tagline}</p> : null}
            <p className="inline-flex items-center gap-1 text-xs text-ink-muted">
              <MapPin className="size-3" />
              {b.region || "Region not provided"}
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-ink-muted">Revenue</p>
                <p className="font-medium tabular-nums">{money(b.revenue)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Profit</p>
                <p className="font-medium tabular-nums">{money(b.profit)}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm font-medium text-forest"
                onClick={() => {
                  setSelectedBusinessId(b.business_id);
                  void navigate({ to: "/sales" });
                }}
              >
                Manage business
                <ChevronRight className="size-4" />
              </button>
              <Button size="sm" variant="ghost" onClick={() => setMediaForId(b.business_id)}>
                <ImagePlus className="size-3.5" />
                Photos & videos
                {b.gallery?.length ? ` (${b.gallery.length})` : ""}
              </Button>
            </div>
            </div>
          </Card>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-paper/50 p-6 text-center text-ink-muted hover:bg-paper"
        >
          <Plus className="size-6" />
          <strong className="text-ink">Add another business</strong>
          <span className="text-sm">Restaurant, hardware, farm, or something new</span>
        </button>
      </div>

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add business</DialogTitle>
          </DialogHeader>
          <BusinessForm
            onCancel={() => setOpen(false)}
            onSubmit={async (form) => {
              try {
                const businessId = await addBusiness(form);
                if (form.media.length) await uploadBusinessMedia(businessId, form.media);
                await refreshPublicMarketplace();
                toast.success(
                  form.listed ? `${form.name} added and listed on the marketplace.` : `${form.name} added.`,
                );
                setOpen(false);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Unable to save business.");
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <MediaManagerDialog
        open={Boolean(mediaFor)}
        onClose={() => setMediaForId(null)}
        title={mediaFor ? `${mediaFor.business_name}: photos & videos` : "Photos & videos"}
        gallery={mediaFor?.gallery || []}
        coverUrl={mediaFor?.image_url}
        onUpload={async (files) => {
          if (!mediaFor) return;
          await uploadBusinessMedia(mediaFor.business_id, files);
        }}
        onRemove={async (mediaId) => {
          if (!mediaFor) return;
          await removeBusinessMedia(mediaFor.business_id, mediaId);
        }}
        onReorder={async (order) => {
          if (!mediaFor) return;
          await reorderBusinessMedia(mediaFor.business_id, order);
        }}
      />
    </>
  );
}

function BusinessForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (form: {
    name: string;
    type: string;
    region: string;
    media: StagedMedia[];
    listed: boolean;
    status: string;
    tagline: string;
    phone: string;
    email: string;
  }) => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    name: "",
    type: "Restaurant",
    region: "",
    media: [] as StagedMedia[],
    listed: false,
    status: "open",
    tagline: "",
    phone: "",
    email: "",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.name) return;
        onSubmit(form);
      }}
    >
      <Field label="Business name">
        <Input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Felix Hardware"
        />
      </Field>
      <Field label="Type">
        <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {[
            "Restaurant",
            "Construction",
            "Agriculture",
            "Retail",
            "Manufacturing",
            "Transport",
            "Professional Services",
            "Other",
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      </Field>
      <Field label="Region / city">
        <Input
          value={form.region}
          onChange={(e) => setForm({ ...form, region: e.target.value })}
          placeholder="Nairobi"
        />
      </Field>
      <Field label="Business status">
        <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </Select>
      </Field>
      <MediaPicker
        label="Business photos & videos"
        hint="First photo becomes the business cover. Up to 10 files — images up to 6MB, videos up to 40MB."
        value={form.media}
        onChange={(media) => setForm({ ...form, media })}
      />
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.listed}
          onChange={(e) => setForm({ ...form, listed: e.target.checked })}
        />
        List on the marketplace
      </label>
      {form.listed ? (
        <>
          <Field label="Tagline" hint="Shown under the business name in listings">
            <Input
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              placeholder="Fresh hardware supplies, delivered fast"
            />
          </Field>
          <Field label="WhatsApp number">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="0700 000 000"
            />
          </Field>
          <Field label="Contact email" hint="(optional)">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
        </>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Add business</Button>
      </div>
    </form>
  );
}
