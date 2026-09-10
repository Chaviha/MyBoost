import { createFileRoute } from "@tanstack/react-router";
import { Eye, ImagePlus, Landmark, MapPin, MessageCircle, Package, Store } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { money } from "@/lib/format";
import type { StagedMedia } from "@/lib/media";
import { useLife } from "@/lib/store";
import type { Asset } from "@/lib/types";

export const Route = createFileRoute("/_app/assets")({
  component: AssetsPage,
});

function AssetsPage() {
  const { myAssets, visibleBusinesses, addAsset, uploadAssetMedia, removeAssetMedia, refreshPublicMarketplace } = useLife();
  const [open, setOpen] = useState(false);
  const [mediaFor, setMediaFor] = useState<Asset | null>(null);
  const total = myAssets.reduce((s: number, a: Asset) => s + a.value, 0);
  const listed = myAssets.filter((a: Asset) => a.listed).length;

  function nameOf(ownership: string) {
    if (!ownership) return "Personal";
    return visibleBusinesses.find((b) => b.business_id === ownership)?.business_name || "Business";
  }

  return (
    <>
      <Card className="mb-5 flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-ink-muted uppercase">
            Total asset value
          </p>
          <p className="mt-1 font-display text-3xl font-medium tabular-nums">{money(total)}</p>
          {listed > 0 ? (
            <p className="mt-1 text-sm text-ink-muted">
              {listed} listed on the marketplace
            </p>
          ) : null}
        </div>
        <Landmark className="size-9 text-forest" />
      </Card>

      <Toolbar
        title="My assets"
        subtitle="What you and your businesses own."
        actionLabel="Add asset"
        onAction={() => setOpen(true)}
      />

      {myAssets.length === 0 ? (
        <EmptyState icon={Package} text="No assets added yet." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {myAssets.map((asset: Asset) => (
            <Card key={asset.asset_id} className="overflow-hidden p-0">
              <ListingCover
                src={asset.image_url}
                alt={asset.name}
                type={asset.type}
                className="h-36"
              />
              <div className="flex flex-col gap-2 p-5">
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">
                  {asset.type}
                </p>
                {asset.listed ? (
                  <Badge tone="forest">
                    <Store className="size-3" />
                    Listed
                  </Badge>
                ) : null}
              </div>
              <h3 className="font-display text-lg font-medium tracking-tight">{asset.name}</h3>
              {asset.notes ? <p className="text-sm text-ink-muted">{asset.notes}</p> : null}
              <p className="font-display text-xl font-medium tabular-nums">{money(asset.value)}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <Badge>{nameOf(asset.business_id)}</Badge>
                {asset.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />
                    {asset.location}
                  </span>
                ) : null}
              </div>
              {asset.listed ? (
                <div className="mt-1 flex gap-4 text-xs text-ink-muted">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="size-3" />
                    {asset.views}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="size-3" />
                    {asset.whatsapp_clicks} contacted
                  </span>
                </div>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="mt-1 self-start"
                onClick={() => setMediaFor(asset)}
              >
                <ImagePlus className="size-3.5" />
                Photos & videos
                {asset.gallery?.length ? ` (${asset.gallery.length})` : ""}
              </Button>
            </div>
            </Card>
          ))}
        </div>
      )}

      <AssetDialog
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={async (form) => {
          try {
            const assetId = await addAsset(form);
            if (form.media.length) await uploadAssetMedia(assetId, form.media);
            await refreshPublicMarketplace();
            toast.success(
              form.listed ? `${form.name} listed on the marketplace.` : `${form.name} added.`,
            );
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to save asset.");
          }
        }}
      />

      <MediaManagerDialog
        open={Boolean(mediaFor)}
        onClose={() => setMediaFor(null)}
        title={mediaFor ? `${mediaFor.name}: photos & videos` : "Photos & videos"}
        gallery={mediaFor?.gallery || []}
        onUpload={async (files) => {
          if (!mediaFor) return;
          await uploadAssetMedia(mediaFor.asset_id, files);
        }}
        onRemove={async (mediaId) => {
          if (!mediaFor) return;
          await removeAssetMedia(mediaFor.asset_id, mediaId);
        }}
      />
    </>
  );
}

function AssetDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: {
    name: string;
    type: string;
    value: string;
    ownership: "personal" | "business";
    listed: boolean;
    listingType: "For sale" | "For hire";
    location: string;
    phone: string;
    media: StagedMedia[];
  }) => void | Promise<void>;
}) {
  const emptyForm = {
    name: "",
    type: "Property",
    value: "",
    ownership: "personal" as "personal" | "business",
    listed: false,
    listingType: "For sale",
    location: "",
    phone: "",
    media: [] as StagedMedia[],
  };
  const [form, setForm] = useState(emptyForm);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add asset</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!form.name || !form.value) return;
            await onSubmit(form);
            onClose();
            setForm(emptyForm);
          }}
        >
          <Field label="Asset name">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Toyota Prado"
            />
          </Field>
          <Field label="Type">
            <Select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {["Property", "Vehicle", "Land", "Equipment", "Investment", "Other"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ownership">
            <Select
              value={form.ownership}
              onChange={(e) =>
                setForm({ ...form, ownership: e.target.value as "personal" | "business" })
              }
            >
              <option value="personal">Personal</option>
              <option value="business">Current business</option>
            </Select>
          </Field>
          <Field label="Estimated value (KSh)">
            <Input
              required
              type="number"
              min={0}
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </Field>
          <MediaPicker
            label="Photos & videos"
            hint="First photo becomes the cover. Up to 10 files — images up to 6MB, videos up to 40MB."
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
            <Field label="Listing type">
              <Select
                value={form.listingType}
                onChange={(e) => setForm({ ...form, listingType: e.target.value as "For sale" | "For hire" })}
              >
                <option value="For sale">For sale</option>
                <option value="For hire">For hire</option>
              </Select>
            </Field>
          ) : null}
          {form.listed ? (
            <>
              <Field label="Location">
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Westlands, Nairobi"
                />
              </Field>
              <Field label="WhatsApp number">
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="0700 000 000"
                />
              </Field>
            </>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Add asset</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
