import { MapPin, MessageCircle } from "lucide-react";
import { useState } from "react";

import { ListingCover } from "@/components/listing-cover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/format";
import type { MarketplaceListing } from "@/lib/types";

export type MarketKind = "all" | "product" | "service" | "asset" | "professional";

function openWhatsApp(phone: string, text: string) {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  const number = digits.startsWith("0") ? "254" + digits.slice(1) : digits;
  if (number && typeof window !== "undefined") {
    window.open(
      `https://wa.me/${number}?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }
}

function isVideo(media: { url: string; media_type?: string }) {
  return (
    media.media_type?.toLowerCase() === "video" ||
    /\.(mp4|webm|ogg|mov|m4v)(?:[?#].*)?$/i.test(media.url)
  );
}

function priceLabel(item: MarketplaceListing) {
  if (!item.selling_price) return "Price on request";
  return `${money(item.selling_price)}${item.unit ? ` / ${item.unit}` : ""}`;
}

/** Filter chips for the Market tab. */
export function MarketKindChips({
  kind,
  onChange,
}: {
  kind: MarketKind;
  onChange: (kind: MarketKind) => void;
}) {
  const filters: Array<{ value: MarketKind; label: string }> = [
    { value: "all", label: "All" },
    { value: "product", label: "Products" },
    { value: "service", label: "Services" },
    { value: "asset", label: "Assets" },
    { value: "professional", label: "Professionals" },
  ];
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {filters.map((f) => (
        <Button
          key={f.value}
          size="sm"
          variant={kind === f.value ? "default" : "secondary"}
          onClick={() => onChange(f.value)}
        >
          {f.label}
        </Button>
      ))}
    </div>
  );
}

/** Which listings the current chip + search show. Products/services only appear under All, Products or Services. */
export function filterListings(items: MarketplaceListing[], kind: MarketKind, query: string) {
  if (kind === "asset" || kind === "professional") return [];
  const q = query.trim().toLowerCase();
  return items.filter(
    (item) =>
      (kind === "all" || item.item_kind === kind) &&
      `${item.name} ${item.category} ${item.family} ${item.business_name} ${item.description} ${item.item_kind}`
        .toLowerCase()
        .includes(q),
  );
}

/** Product and service cards with a details window. Pass the already-filtered items. */
export function MarketplaceListings({ items }: { items: MarketplaceListing[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId
    ? (items.find((item) => item.product_id === selectedId) ?? null)
    : null;

  return (
    <div>
      {items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card
              key={item.product_id}
              className="cursor-pointer overflow-hidden p-0 transition hover:-translate-y-0.5"
              onClick={() => setSelectedId(item.product_id)}
            >
              <ListingCover src={item.image_url} alt={item.name} type="Other" className="h-44" />
              <div className="space-y-2 p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium tracking-[0.14em] text-forest uppercase">
                    {item.category || (item.item_kind === "service" ? "Service" : "Product")}
                  </p>
                  <Badge tone={item.item_kind === "service" ? "amber" : "forest"}>
                    {item.item_kind === "service" ? "Service" : "Product"}
                  </Badge>
                </div>
                <h3 className="font-display text-xl font-medium tracking-tight">{item.name}</h3>
                <p className="text-sm text-ink-muted">{item.business_name}</p>
                <p className="font-display text-xl font-medium tabular-nums">{priceLabel(item)}</p>
                <Button
                  variant="secondary"
                  className="mt-2 w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(item.product_id);
                  }}
                >
                  View details
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">{selected.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-5">
                <ListingCover
                  src={selected.image_url || selected.gallery.find((m) => !isVideo(m))?.url}
                  alt={selected.name}
                  type="Other"
                  className="h-64 rounded-xl"
                />

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={selected.item_kind === "service" ? "amber" : "forest"}>
                      {selected.item_kind === "service" ? "Service" : "Product"}
                    </Badge>
                    {selected.category ? (
                      <span className="text-xs font-medium tracking-[0.14em] text-forest uppercase">
                        {selected.category}
                        {selected.family ? ` · ${selected.family}` : ""}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 font-display text-3xl font-medium tabular-nums">
                    {priceLabel(selected)}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-sm text-ink-muted">
                    <MapPin className="size-3.5" />
                    Offered by {selected.business_name}
                  </p>
                </div>

                {selected.description ? (
                  <div>
                    <h4 className="mb-1 font-display text-lg font-medium">Details</h4>
                    <p className="text-sm whitespace-pre-line text-ink-muted">
                      {selected.description}
                    </p>
                  </div>
                ) : null}

                {Object.keys(selected.specs || {}).length ? (
                  <div>
                    <h4 className="mb-2 font-display text-lg font-medium">Specifications</h4>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      {Object.entries(selected.specs).map(([key, value]) => (
                        <div key={key} className="contents">
                          <dt className="text-ink-muted">{key}</dt>
                          <dd className="font-medium">{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}

                {selected.gallery.length ? (
                  <div>
                    <h4 className="mb-2 font-display text-lg font-medium">Photos &amp; videos</h4>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {selected.gallery.map((media) =>
                        isVideo(media) ? (
                          <video
                            key={media.media_id}
                            src={media.url}
                            controls
                            className="aspect-square w-full rounded-xl object-cover"
                          />
                        ) : (
                          <img
                            key={media.media_id}
                            src={media.url}
                            alt={media.name || selected.name}
                            className="aspect-square w-full rounded-xl object-cover"
                          />
                        ),
                      )}
                    </div>
                  </div>
                ) : null}

                <Button
                  className="w-full"
                  onClick={() =>
                    openWhatsApp(
                      selected.business_phone,
                      `Hi, I found "${selected.name}" from ${selected.business_name} on LifeBoost Marketplace.`,
                    )
                  }
                >
                  <MessageCircle className="size-4" />
                  Contact {selected.business_name} on WhatsApp
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
