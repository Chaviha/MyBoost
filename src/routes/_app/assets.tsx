import { createFileRoute } from "@tanstack/react-router";
import {
  Download,
  Eye,
  FileText,
  ImagePlus,
  Landmark,
  LayoutGrid,
  List,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  Printer,
  Share2,
  Store,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import {
  downloadAssetsBrochureHtml,
  printAssetsBrochure,
  shareAssetsBrochure,
  type BrochureAsset,
} from "@/lib/assets-brochure";
import { money } from "@/lib/format";
import type { StagedMedia } from "@/lib/media";
import { SearchFilter } from "@/components/search-filter";
import { useLife } from "@/lib/store";
import type { Asset } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/assets")({
  component: AssetsPage,
});

type AssetFormValues = {
  name: string;
  type: string;
  value: string;
  ownership: "personal" | "business";
  listed: boolean;
  listingType: "For sale" | "For hire";
  location: string;
  phone: string;
  notes: string;
  media: StagedMedia[];
};

function AssetsPage() {
  const {
    myAssets,
    visibleBusinesses,
    selectedBusinessId,
    addAsset,
    updateAsset,
    deleteAsset,
    bulkUpdateAssets,
    bulkDeleteAssets,
    uploadAssetMedia,
    removeAssetMedia,
    refreshPublicMarketplace,
    can,
    user,
  } = useLife();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [mediaFor, setMediaFor] = useState<Asset | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkListingType, setBulkListingType] = useState<"For sale" | "For hire">("For sale");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const total = myAssets.reduce((s: number, a: Asset) => s + a.value, 0);
  const listed = myAssets.filter((a: Asset) => a.listed).length;
  const selectedCount = selected.size;
  const allSelected = myAssets.length > 0 && selectedCount === myAssets.length;
  const selectedAssets = useMemo(
    () => myAssets.filter((a: Asset) => selected.has(a.asset_id)),
    [myAssets, selected],
  );

  const types = useMemo(() => {
    const set = new Set<string>();
    myAssets.forEach((a: Asset) => {
      if (a.type) set.add(a.type);
    });
    return [...set].sort();
  }, [myAssets]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return myAssets.filter((asset: Asset) => {
      if (typeFilter !== "all" && asset.type !== typeFilter) return false;
      if (!q) return true;
      return `${asset.name} ${asset.type} ${asset.location} ${asset.notes}`
        .toLowerCase()
        .includes(q);
    });
  }, [myAssets, searchQuery, typeFilter]);

  useEffect(() => {
    const valid = new Set(myAssets.map((a: Asset) => a.asset_id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [myAssets]);

  if (!can("manage_assets")) {
    return (
      <AccessDenied need="Asset management requires an account with assets permission." />
    );
  }

  function nameOf(ownership: string) {
    if (!ownership) return "Personal";
    return (
      visibleBusinesses.find((b) => b.business_id === ownership)?.business_name ||
      "Business"
    );
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(myAssets.map((a: Asset) => a.asset_id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function afterBulk(message: string) {
    clearSelection();
    await refreshPublicMarketplace();
    toast.success(message);
  }

  function toBrochureAssets(list: Asset[]): BrochureAsset[] {
    return list.map((a) => ({
      name: a.name,
      type: a.type,
      notes: a.notes,
      image_url: a.image_url,
      gallery: (a.gallery || []).map((m) => ({
        url: m.url,
        name: m.name,
        media_type: m.media_type,
      })),
      status: a.status,
      listed: a.listed,
      listing_type: a.listing_type,
      location: a.location,
      phone: a.phone,
    }));
  }

  function brochureOwner() {
    const biz = visibleBusinesses.find((b) => b.business_id === selectedBusinessId);
    return {
      name: user?.name || "Owner",
      phone: user?.phone || "",
      email: user?.email || "",
      business_name: biz?.business_name || "",
      region: biz?.region || "",
    };
  }

  async function handleBrochure(
    mode: "print" | "download" | "share",
    scope: "selected" | "all" | "filtered",
  ) {
    let list: Asset[] = [];
    if (scope === "selected") list = selectedAssets;
    else if (scope === "filtered") list = filtered;
    else list = myAssets;

    if (list.length === 0) {
      toast.message(
        scope === "selected"
          ? "Select at least one asset to include in the brochure."
          : "No assets to put in a brochure yet.",
      );
      return;
    }

    const owner = brochureOwner();
    const items = toBrochureAssets(list);
    const title =
      scope === "selected"
        ? `${owner.business_name || owner.name} — Selected assets`
        : `${owner.business_name || owner.name} — Asset brochure`;

    try {
      toast.message("Preparing brochure images…");
      if (mode === "print") {
        await printAssetsBrochure(owner, items, { title });
        toast.success("Brochure opened — use Print → Save as PDF.");
      } else if (mode === "download") {
        await downloadAssetsBrochureHtml(owner, items, { title });
        toast.success("Brochure HTML downloaded.");
      } else {
        const result = await shareAssetsBrochure(owner, items, { title });
        toast.success(result === "shared" ? "Brochure shared." : "Brochure downloaded.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create brochure.");
    }
  }

  return (
    <>
      {/* Hero stats */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-[#0f3d2c] via-[#1f6b4a] to-[#2d8f62] p-5 text-white shadow-lg">
          <div className="absolute -right-6 -top-6 size-28 rounded-full bg-white/10" />
          <p className="text-[11px] font-semibold tracking-[0.16em] text-white/80 uppercase">
            Total asset value
          </p>
          <p className="mt-2 font-display text-3xl font-semibold tabular-nums tracking-tight">
            {money(total)}
          </p>
          <p className="mt-2 text-sm text-white/75">
            {myAssets.length} asset{myAssets.length === 1 ? "" : "s"} in portfolio
          </p>
          <Landmark className="absolute right-4 bottom-4 size-8 text-white/25" />
        </Card>

        <Card className="p-5">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">
            On marketplace
          </p>
          <p className="mt-2 font-display text-3xl font-medium tabular-nums text-forest">
            {listed}
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            {listed === 0
              ? "None listed yet — list assets to reach buyers"
              : `${listed} live listing${listed === 1 ? "" : "s"}`}
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">
            Brochure
          </p>
          <p className="mt-2 text-sm text-ink-muted leading-relaxed">
            Download a polished PDF-ready brochure of all or selected assets to share with clients.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleBrochure("print", selectedCount > 0 ? "selected" : "all")}
            >
              <Printer className="size-3.5" />
              {selectedCount > 0 ? "Print selected" : "Print all"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleBrochure("download", selectedCount > 0 ? "selected" : "all")}
            >
              <Download className="size-3.5" />
              HTML
            </Button>
          </div>
        </Card>
      </div>

      <Toolbar
        title="My assets"
        subtitle="What you and your businesses own. Select multiple for bulk actions or brochure export."
        actionLabel="Add asset"
        onAction={() => {
          setEditing(null);
          setOpen(true);
        }}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchFilter onSearch={setSearchQuery} placeholder="Search assets…" />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="h-9 w-auto min-w-[8rem] text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <div className="flex rounded-lg border border-line p-0.5">
            <button
              type="button"
              className={cn(
                "rounded-md p-1.5 transition",
                viewMode === "grid" ? "bg-forest/10 text-forest" : "text-ink-muted hover:text-ink",
              )}
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md p-1.5 transition",
                viewMode === "list" ? "bg-forest/10 text-forest" : "text-ink-muted hover:text-ink",
              )}
              onClick={() => setViewMode("list")}
              aria-label="List view"
            >
              <List className="size-4" />
            </button>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleBrochure("print", "filtered")}
            title="Brochure of currently filtered assets"
          >
            <FileText className="size-3.5" />
            Brochure
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void handleBrochure("share", selectedCount > 0 ? "selected" : "filtered")}
          >
            <Share2 className="size-3.5" />
            Share
          </Button>
        </div>
      </div>

      {myAssets.length === 0 ? (
        <EmptyState icon={Package} text="No assets added yet." />
      ) : (
        <>
          <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-line"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = selectedCount > 0 && !allSelected;
                }}
                onChange={toggleAll}
              />
              <span>
                {selectedCount === 0
                  ? `Select all (${myAssets.length})`
                  : `${selectedCount} selected`}
              </span>
            </label>

            {selectedCount > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleBrochure("print", "selected")}
                >
                  <Printer className="size-3.5" />
                  Brochure
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    bulkUpdateAssets([...selected], {
                      listed: true,
                      listing_type: bulkListingType,
                    });
                    await afterBulk(
                      `${selectedCount} asset${selectedCount === 1 ? "" : "s"} listed on the marketplace.`,
                    );
                  }}
                >
                  <Store className="size-3.5" />
                  List
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    bulkUpdateAssets([...selected], { listed: false });
                    await afterBulk(
                      `${selectedCount} asset${selectedCount === 1 ? "" : "s"} unlisted.`,
                    );
                  }}
                >
                  Unlist
                </Button>
                <Select
                  className="h-9 w-auto min-w-[7.5rem] text-sm"
                  value={bulkListingType}
                  onChange={(e) =>
                    setBulkListingType(e.target.value as "For sale" | "For hire")
                  }
                  aria-label="Bulk listing type"
                >
                  <option value="For sale">For sale</option>
                  <option value="For hire">For hire</option>
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const listedSelected = selectedAssets.filter((a) => a.listed);
                    if (listedSelected.length === 0) {
                      toast.message("Select listed assets to change listing type.");
                      return;
                    }
                    bulkUpdateAssets(
                      listedSelected.map((a) => a.asset_id),
                      { listing_type: bulkListingType },
                    );
                    await afterBulk(
                      `Listing type set to “${bulkListingType}” for ${listedSelected.length} asset${listedSelected.length === 1 ? "" : "s"}.`,
                    );
                  }}
                >
                  Set type
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Delete ${selectedCount} asset${selectedCount === 1 ? "" : "s"}? Listed ones will leave the marketplace.`,
                      )
                    ) {
                      return;
                    }
                    bulkDeleteAssets([...selected]);
                    await afterBulk(
                      `${selectedCount} asset${selectedCount === 1 ? "" : "s"} deleted.`,
                    );
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSelection}>
                  Clear
                </Button>
              </div>
            ) : (
              <p className="text-xs text-ink-muted">
                Tip: tick assets to list, unlist, export brochure, or delete in bulk.
              </p>
            )}
          </Card>

          {filtered.length === 0 ? (
            <EmptyState icon={Package} text="No assets match your search or filter." />
          ) : viewMode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((asset: Asset) => {
                const isSelected = selected.has(asset.asset_id);
                return (
                  <Card
                    key={asset.asset_id}
                    className={cn(
                      "group overflow-hidden p-0 transition-shadow hover:shadow-md",
                      isSelected && "ring-2 ring-forest/45",
                    )}
                  >
                    <div className="relative">
                      <ListingCover
                        src={asset.image_url}
                        alt={asset.name}
                        type={asset.type}
                        className="h-40 transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                      <label className="absolute top-2.5 left-2.5 z-10 flex size-9 cursor-pointer items-center justify-center rounded-lg bg-paper/95 shadow-border backdrop-blur-sm">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-line"
                          checked={isSelected}
                          onChange={() => toggleOne(asset.asset_id)}
                          aria-label={`Select ${asset.name}`}
                        />
                      </label>
                      {asset.listed ? (
                        <span className="absolute top-2.5 right-2.5 z-10 inline-flex items-center gap-1 rounded-full bg-forest px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white uppercase shadow">
                          <Store className="size-3" />
                          {asset.listing_type || "Listed"}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-2 p-4">
                      <p className="text-[11px] font-semibold tracking-[0.14em] text-forest uppercase">
                        {asset.type}
                      </p>
                      <h3 className="font-display text-lg font-medium tracking-tight leading-snug">
                        {asset.name}
                      </h3>
                      {asset.notes ? (
                        <p className="line-clamp-2 text-sm text-ink-muted">{asset.notes}</p>
                      ) : null}
                      <p className="font-display text-xl font-semibold tabular-nums text-ink">
                        {money(asset.value)}
                      </p>
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
                        <div className="mt-0.5 flex gap-4 text-xs text-ink-muted">
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
                      <div className="mt-1 flex items-center justify-end border-t border-line/60 pt-2">
                        <MoreActions
                          actions={[
                            {
                              label: "Edit",
                              icon: <Pencil className="size-4" />,
                              onSelect: () => {
                                setEditing(asset);
                                setOpen(true);
                              },
                            },
                            {
                              label: "Photos & videos",
                              icon: <ImagePlus className="size-4" />,
                              onSelect: () => setMediaFor(asset),
                            },
                            {
                              label: "Brochure (this asset)",
                              icon: <FileText className="size-4" />,
                              onSelect: () => {
                                void (async () => {
                                  try {
                                    toast.message("Preparing brochure images…");
                                    await printAssetsBrochure(brochureOwner(), toBrochureAssets([asset]), {
                                      title: asset.name,
                                    });
                                    toast.success("Brochure opened for this asset.");
                                  } catch (err) {
                                    toast.error(
                                      err instanceof Error ? err.message : "Could not create brochure.",
                                    );
                                  }
                                })();
                              },
                            },
                            {
                              label: "Delete",
                              destructive: true,
                              icon: <Trash2 className="size-4" />,
                              onSelect: () => {
                                if (
                                  !window.confirm(
                                    `Delete ${asset.name}?${asset.listed ? " It will also be removed from the marketplace." : ""}`,
                                  )
                                )
                                  return;
                                deleteAsset(asset.asset_id);
                                void refreshPublicMarketplace();
                                toast.success("Asset deleted.");
                              },
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            /* List view */
            <div className="flex flex-col gap-2">
              {filtered.map((asset: Asset) => {
                const isSelected = selected.has(asset.asset_id);
                return (
                  <Card
                    key={asset.asset_id}
                    className={cn(
                      "flex flex-col gap-3 p-3 sm:flex-row sm:items-center",
                      isSelected && "ring-2 ring-forest/40",
                    )}
                  >
                    <label className="flex shrink-0 cursor-pointer items-center gap-3 sm:w-auto">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-line"
                        checked={isSelected}
                        onChange={() => toggleOne(asset.asset_id)}
                        aria-label={`Select ${asset.name}`}
                      />
                      <ListingCover
                        src={asset.image_url}
                        alt={asset.name}
                        type={asset.type}
                        className="h-16 w-24 rounded-lg"
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-base font-medium">{asset.name}</h3>
                        <Badge tone="neutral">{asset.type}</Badge>
                        {asset.listed ? (
                          <Badge tone="forest">{asset.listing_type || "Listed"}</Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-muted">
                        <span>{nameOf(asset.business_id)}</span>
                        {asset.location ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" />
                            {asset.location}
                          </span>
                        ) : null}
                        {asset.listed ? (
                          <>
                            <span className="inline-flex items-center gap-1">
                              <Eye className="size-3" />
                              {asset.views}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MessageCircle className="size-3" />
                              {asset.whatsapp_clicks}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <p className="font-display text-lg font-semibold tabular-nums">
                        {money(asset.value)}
                      </p>
                      <MoreActions
                        actions={[
                          {
                            label: "Edit",
                            icon: <Pencil className="size-4" />,
                            onSelect: () => {
                              setEditing(asset);
                              setOpen(true);
                            },
                          },
                          {
                            label: "Photos & videos",
                            icon: <ImagePlus className="size-4" />,
                            onSelect: () => setMediaFor(asset),
                          },
                          {
                            label: "Brochure (this asset)",
                            icon: <FileText className="size-4" />,
                            onSelect: () => {
                              void (async () => {
                                try {
                                  toast.message("Preparing brochure images…");
                                  await printAssetsBrochure(brochureOwner(), toBrochureAssets([asset]), {
                                    title: asset.name,
                                  });
                                  toast.success("Brochure opened for this asset.");
                                } catch (err) {
                                  toast.error(
                                    err instanceof Error ? err.message : "Could not create brochure.",
                                  );
                                }
                              })();
                            },
                          },
                          {
                            label: "Delete",
                            destructive: true,
                            icon: <Trash2 className="size-4" />,
                            onSelect: () => {
                              if (
                                !window.confirm(
                                  `Delete ${asset.name}?${asset.listed ? " It will also be removed from the marketplace." : ""}`,
                                )
                              )
                                return;
                              deleteAsset(asset.asset_id);
                              void refreshPublicMarketplace();
                              toast.success("Asset deleted.");
                            },
                          },
                        ]}
                      />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <AssetDialog
        open={open}
        asset={editing}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        onSubmit={async (form) => {
          try {
            if (editing) {
              const nextBusinessId =
                form.ownership === "business"
                  ? editing.business_id || selectedBusinessId || ""
                  : "";
              updateAsset(editing.asset_id, {
                name: form.name.trim(),
                type: form.type,
                value: Number(form.value || 0),
                business_id: nextBusinessId,
                listed: form.listed,
                listing_type: form.listingType,
                location: form.location,
                phone: form.phone,
                notes: form.notes,
              });
              await refreshPublicMarketplace();
              toast.success(
                form.listed
                  ? `${form.name} updated and listed on the marketplace.`
                  : `${form.name} updated.`,
              );
            } else {
              const assetId = await addAsset(form);
              if (form.media.length) await uploadAssetMedia(assetId, form.media);
              await refreshPublicMarketplace();
              toast.success(
                form.listed ? `${form.name} listed on the marketplace.` : `${form.name} added.`,
              );
            }
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
  asset,
  onClose,
  onSubmit,
}: {
  open: boolean;
  asset: Asset | null;
  onClose: () => void;
  onSubmit: (form: AssetFormValues) => void | Promise<void>;
}) {
  const { selectedBusinessId } = useLife();
  const emptyForm: AssetFormValues = {
    name: "",
    type: "Property",
    value: "",
    ownership: "personal",
    listed: false,
    listingType: "For sale",
    location: "",
    phone: "",
    notes: "",
    media: [],
  };
  const [form, setForm] = useState<AssetFormValues>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (asset) {
      setForm({
        name: asset.name,
        type: asset.type || "Property",
        value: String(asset.value ?? ""),
        ownership: asset.business_id ? "business" : "personal",
        listed: Boolean(asset.listed),
        listingType: asset.listing_type || "For sale",
        location: asset.location || "",
        phone: asset.phone || "",
        notes: asset.notes || "",
        media: [],
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, asset]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{asset ? "Edit asset" : "Add asset"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!form.name || !form.value) return;
            if (form.ownership === "business" && !asset?.business_id && !selectedBusinessId) {
              toast.error("Select a business first, or choose Personal ownership.");
              return;
            }
            setSaving(true);
            try {
              await onSubmit(form);
              onClose();
            } finally {
              setSaving(false);
            }
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
          <Field label="Notes" hint="(optional)">
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Condition, registration, etc."
            />
          </Field>
          {!asset ? (
            <MediaPicker
              label="Photos & videos"
              hint="First photo becomes the cover. Up to 10 files — images up to 6MB, videos up to 40MB."
              value={form.media}
              onChange={(media) => setForm({ ...form, media })}
            />
          ) : null}
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.listed}
              onChange={(e) => setForm({ ...form, listed: e.target.checked })}
              className="size-4 rounded border-line"
            />
            List on marketplace
          </label>
          {form.listed ? (
            <>
              <Field label="Listing type">
                <Select
                  value={form.listingType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      listingType: e.target.value as "For sale" | "For hire",
                    })
                  }
                >
                  <option value="For sale">For sale</option>
                  <option value="For hire">For hire</option>
                </Select>
              </Field>
              <Field label="Location">
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="City / area"
                />
              </Field>
              <Field label="Contact phone">
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+254…"
                />
              </Field>
            </>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : asset ? "Save changes" : "Add asset"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
