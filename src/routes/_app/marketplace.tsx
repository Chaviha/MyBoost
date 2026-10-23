import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  MapPin,
  Maximize2,
  MessageCircle,
  Minus,
  Plus,
  Search,
  Store,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { ListingCover } from "@/components/listing-cover";
import {
  filterListings,
  MarketKindChips,
  MarketplaceListings,
  type MarketKind,
} from "@/components/marketplace-listings";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { initials, money } from "@/lib/format";
import type { Asset, Business, Employee } from "@/lib/types";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/marketplace")({
  component: MarketplacePage,
});

type MarketplaceMedia = {
  media_id: string;
  url: string;
  media_type?: string;
  name?: string;
};

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

function isVideo(media: MarketplaceMedia) {
  return (
    media.media_type?.toLowerCase() === "video" ||
    /\.(mp4|webm|ogg|mov|m4v)(?:[?#].*)?$/i.test(media.url)
  );
}

function assetMedia(asset: Asset): MarketplaceMedia[] {
  const gallery = (asset.gallery || []) as MarketplaceMedia[];
  const cover = asset.image_url;

  if (cover && !gallery.some((item) => item.url === cover)) {
    return [
      {
        media_id: `cover-${asset.asset_id}`,
        url: cover,
        media_type: "image",
        name: asset.name,
      },
      ...gallery,
    ];
  }

  return gallery;
}

function businessMedia(business: Business): MarketplaceMedia[] {
  const gallery = (business.gallery || []) as MarketplaceMedia[];
  const cover = business.image_url;

  if (cover && !gallery.some((item) => item.url === cover)) {
    return [
      {
        media_id: `cover-${business.business_id}`,
        url: cover,
        media_type: "image",
        name: business.business_name,
      },
      ...gallery,
    ];
  }

  return gallery;
}

function MarketplacePage() {
  const {
    publicMarketplace,
    refreshPublicMarketplace,
    viewAsset,
    contactAsset,
    viewProfessional,
    contactProfessional,
    viewBusiness,
    contactBusiness,
  } = useLife();

  const [tab, setTab] = useState("market");
  const [kind, setKind] = useState<MarketKind>("all");
  const [q, setQ] = useState("");
  const [businessDetailId, setBusinessDetailId] = useState<string | null>(null);

  const [mediaViewer, setMediaViewer] = useState<{
    title: string;
    items: MarketplaceMedia[];
    index: number;
  } | null>(null);

  const [zoom, setZoom] = useState(1);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    void refreshPublicMarketplace();

    const onFocus = () => {
      void refreshPublicMarketplace();
    };

    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const ql = q.trim().toLowerCase();

  const assets = (publicMarketplace.assets as Asset[]).filter((a) =>
    `${a.name} ${a.type} ${a.location} ${a.notes}`.toLowerCase().includes(ql),
  );

  const pros = (
    publicMarketplace.professionals as Array<Employee & { business_name: string }>
  ).filter((p) =>
    `${p.name} ${p.role} ${p.location} ${p.business_name}`.toLowerCase().includes(ql),
  );

  const listings = filterListings(publicMarketplace.listings, kind, q);
  const showAssets = kind === "all" || kind === "asset";
  const showPros = kind === "all" || kind === "professional";
  const nothingToShow =
    listings.length === 0 && !(showAssets && assets.length > 0) && !(showPros && pros.length > 0);

  const firms = (publicMarketplace.businesses as Business[]).filter((b) =>
    `${b.business_name} ${b.tagline} ${b.region}`.toLowerCase().includes(ql),
  );

  const selectedMarketplaceBusiness = businessDetailId
    ? (firms.find((b) => b.business_id === businessDetailId) ?? null)
    : null;

  function once(key: string, fn: () => void) {
    if (seen.current.has(key)) return;
    seen.current.add(key);
    fn();
  }

  function openMedia(title: string, items: MarketplaceMedia[], index = 0) {
    if (!items.length) {
      toast.info("No photos or videos are available.");
      return;
    }

    const safeIndex = Math.max(0, Math.min(index, items.length - 1));
    setZoom(1);
    setMediaViewer({ title, items, index: safeIndex });
  }

  function changeMedia(index: number) {
    if (!mediaViewer) return;
    if (index < 0 || index >= mediaViewer.items.length) return;
    setZoom(1);
    setMediaViewer({ ...mediaViewer, index });
  }

  function closeMedia() {
    setMediaViewer(null);
    setZoom(1);
  }

  return (
    <>
      <PageHeader
        eyebrow="Public listings"
        title="Marketplace"
        subtitle="Products, services, assets, professionals and businesses listed by LifeBoost users."
      />

      <div className="mb-4 flex h-11 items-center gap-2 rounded-lg bg-paper px-3 shadow-border">
        <Search className="size-4 text-ink-faint" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, category, location…"
          className="h-full border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 p-1">
          <TabsTrigger value="market">Market</TabsTrigger>
          <TabsTrigger value="businesses">Businesses</TabsTrigger>
        </TabsList>

        {/* MARKET: products, services, assets and professionals */}
        <TabsContent value="market">
          <MarketKindChips kind={kind} onChange={setKind} />

          {nothingToShow ? (
            <EmptyState
              icon={Store}
              text={q || kind !== "all" ? "Nothing matches your search." : "Nothing is listed yet."}
            />
          ) : null}

          {listings.length > 0 ? (
            <section className="mb-8">
              {kind === "all" ? (
                <h2 className="mb-3 font-display text-lg font-medium">Products &amp; services</h2>
              ) : null}
              <MarketplaceListings items={listings} />
            </section>
          ) : null}

          {showAssets && assets.length > 0 ? (
            <section className="mb-8">
              {kind === "all" ? (
                <h2 className="mb-3 font-display text-lg font-medium">Assets</h2>
              ) : null}
              {assets.length === 0 ? (
                <EmptyState icon={Store} text={q ? "No assets match." : "No assets listed yet."} />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {assets.map((asset) => {
                    const items = assetMedia(asset);

                    return (
                      <Card
                        key={asset.asset_id}
                        className="overflow-hidden p-0"
                        onMouseEnter={() =>
                          once(`a:${asset.asset_id}`, () => viewAsset(asset.asset_id))
                        }
                      >
                        <button
                          type="button"
                          className="group relative block w-full cursor-zoom-in text-left"
                          onClick={() => openMedia(asset.name, items)}
                          aria-label={`View photos and videos of ${asset.name}`}
                        >
                          <ListingCover
                            src={asset.image_url}
                            alt={asset.name}
                            type={asset.type}
                            className="h-44"
                          />
                          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-black/75 px-3 py-2 text-xs text-white">
                            <Maximize2 className="size-4" />
                            View photos and videos
                          </span>
                        </button>

                        <div className="flex flex-col gap-2 p-5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">
                              {asset.type}
                            </p>
                            <Badge tone="forest">{asset.listing_type || "For sale"}</Badge>
                          </div>

                          <h3 className="font-display text-xl font-medium tracking-tight">
                            {asset.name}
                          </h3>

                          <p className="font-display text-2xl font-medium tabular-nums">
                            {money(asset.value)}
                          </p>

                          {asset.notes ? (
                            <p className="text-sm text-ink-muted">{asset.notes}</p>
                          ) : null}

                          {items.length > 0 ? (
                            <div>
                              <p className="mb-2 text-xs text-ink-muted">
                                Photos and videos · Click to enlarge
                              </p>
                              <div className="grid grid-cols-4 gap-1.5">
                                {items.slice(0, 4).map((media, index) => (
                                  <button
                                    key={media.media_id}
                                    type="button"
                                    className="relative overflow-hidden rounded-md focus-visible:outline-2"
                                    onClick={() => openMedia(asset.name, items, index)}
                                    aria-label={`Open media ${index + 1} for ${asset.name}`}
                                  >
                                    {isVideo(media) ? (
                                      <video
                                        src={media.url}
                                        className="aspect-square w-full object-cover"
                                        muted
                                        playsInline
                                        preload="metadata"
                                      />
                                    ) : (
                                      <img
                                        src={media.url}
                                        alt={media.name || asset.name}
                                        loading="lazy"
                                        className="aspect-square w-full object-cover"
                                      />
                                    )}
                                    {isVideo(media) ? (
                                      <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-lg text-white">
                                        ▶
                                      </span>
                                    ) : (
                                      <span className="absolute bottom-1 right-1 rounded bg-black/60 p-1 text-white">
                                        <Maximize2 className="size-3" />
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                              {items.length > 4 ? (
                                <button
                                  type="button"
                                  className="mt-2 text-sm font-medium text-forest underline"
                                  onClick={() => openMedia(asset.name, items)}
                                >
                                  View all {items.length} items
                                </button>
                              ) : null}
                            </div>
                          ) : null}

                          <p className="inline-flex items-center gap-1 text-xs text-ink-muted">
                            <MapPin className="size-3" />
                            {asset.location || "Location not provided"}
                          </p>

                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                              <Eye className="size-3.5" />
                              {asset.views || 0} views
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                              <MessageCircle className="size-3.5" />
                              {asset.whatsapp_clicks || 0}
                            </span>
                          </div>

                          <Button
                            className="mt-1"
                            onClick={() => {
                              contactAsset(asset.asset_id);
                              openWhatsApp(
                                asset.phone,
                                `Hi, I'm interested in your listing "${asset.name}" (${money(asset.value)}) on LifeBoost Marketplace.`,
                              );
                              toast.success(`Opening WhatsApp for ${asset.name}.`);
                            }}
                          >
                            <MessageCircle className="size-4" />
                            Connect
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          {showPros && pros.length > 0 ? (
            <section className="mb-8">
              {kind === "all" ? (
                <h2 className="mb-3 font-display text-lg font-medium">Professionals</h2>
              ) : null}
              {pros.length === 0 ? (
                <EmptyState
                  icon={BriefcaseBusiness}
                  text={q ? "No professionals match." : "No professionals listed yet."}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {pros.map((p) => (
                    <Card
                      key={p.employee_id}
                      className="overflow-hidden p-0"
                      onMouseEnter={() =>
                        once(`p:${p.employee_id}`, () => viewProfessional(p.employee_id))
                      }
                    >
                      {(p as { image_url?: string }).image_url ? (
                        <ListingCover
                          src={(p as { image_url?: string }).image_url}
                          alt={p.name}
                          type="Other"
                          className="h-36"
                        />
                      ) : (
                        <div className="flex h-36 items-center justify-center bg-leaf">
                          <div className="flex size-16 items-center justify-center rounded-full bg-paper font-display text-2xl font-medium text-forest">
                            {initials(p.name)}
                          </div>
                        </div>
                      )}

                      <div className="p-5">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <Badge tone="amber">Professional</Badge>
                        </div>

                        <h3 className="font-display text-xl font-medium tracking-tight">
                          {p.name}
                        </h3>

                        <p className="text-sm text-ink-muted">
                          {p.role}
                          {p.business_name ? ` · ${p.business_name}` : ""}
                        </p>

                        {p.location ? (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink-muted">
                            <MapPin className="size-3" />
                            {p.location}
                          </p>
                        ) : null}

                        <div className="mt-3 flex items-center gap-3 text-xs text-ink-muted">
                          <span className="inline-flex items-center gap-1">
                            <Eye className="size-3.5" />
                            {p.views}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MessageCircle className="size-3.5" />
                            {p.whatsapp_clicks}
                          </span>
                        </div>

                        <Button
                          className="mt-4 w-full"
                          onClick={() => {
                            contactProfessional(p.employee_id);
                            openWhatsApp(
                              p.phone,
                              `Hi ${p.name}, I found you on LifeBoost Marketplace.`,
                            );
                            toast.success(`Opening WhatsApp for ${p.name}.`);
                          }}
                        >
                          <MessageCircle className="size-4" />
                          Contact on WhatsApp
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </TabsContent>

        {/* BUSINESSES */}
        <TabsContent value="businesses">
          {firms.length === 0 ? (
            <EmptyState
              icon={Building2}
              text={q ? "No businesses match." : "No businesses listed yet."}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {firms.map((b) => (
                <Card
                  key={b.business_id}
                  className="cursor-pointer overflow-hidden p-0 transition hover:-translate-y-0.5"
                  onMouseEnter={() => once(`b:${b.business_id}`, () => viewBusiness(b.business_id))}
                  onClick={() => setBusinessDetailId(b.business_id)}
                >
                  <div className="relative">
                    <ListingCover
                      src={b.image_url}
                      alt={b.business_name}
                      type={b.business_type}
                      className="h-40"
                    />
                    <button
                      type="button"
                      className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-black/75 px-3 py-2 text-xs text-white"
                      onClick={(event) => {
                        event.stopPropagation();
                        openMedia(b.business_name, businessMedia(b));
                      }}
                      aria-label={`View photos and videos of ${b.business_name}`}
                    >
                      <Maximize2 className="size-4" />
                      View media
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">
                        {b.business_type}
                      </p>
                      <Badge
                        tone={String(b.status).toLowerCase() === "closed" ? "amber" : "forest"}
                      >
                        {String(b.status).toLowerCase() === "closed" ? "Closed" : "Open"}
                      </Badge>
                    </div>

                    <h3 className="font-display text-xl font-medium tracking-tight">
                      {b.business_name}
                    </h3>

                    <p className="text-sm text-ink-muted">{b.tagline || b.business_type}</p>

                    {b.region ? (
                      <p className="inline-flex items-center gap-1 text-xs text-ink-muted">
                        <MapPin className="size-3" />
                        {b.region}
                      </p>
                    ) : null}

                    <div className="mt-1 flex items-center gap-3 text-xs text-ink-muted">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="size-3.5" />
                        {b.views}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="size-3.5" />
                        {b.whatsapp_clicks}
                      </span>
                    </div>

                    <Button
                      className="mt-1"
                      onClick={(event) => {
                        event.stopPropagation();
                        contactBusiness(b.business_id);
                        openWhatsApp(
                          b.phone,
                          `Hi, I found ${b.business_name} on LifeBoost Marketplace.`,
                        );
                        toast.success(`Opening WhatsApp for ${b.business_name}.`);
                      }}
                    >
                      <MessageCircle className="size-4" />
                      Contact on WhatsApp
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* BUSINESS DETAILS DIALOG */}
      <Dialog
        open={Boolean(selectedMarketplaceBusiness)}
        onOpenChange={(open) => {
          if (!open) setBusinessDetailId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {selectedMarketplaceBusiness ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">
                  {selectedMarketplaceBusiness.business_name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5">
                <button
                  type="button"
                  className="relative block w-full cursor-zoom-in text-left"
                  onClick={() =>
                    openMedia(
                      selectedMarketplaceBusiness.business_name,
                      businessMedia(selectedMarketplaceBusiness),
                    )
                  }
                >
                  <ListingCover
                    src={selectedMarketplaceBusiness.image_url}
                    alt={selectedMarketplaceBusiness.business_name}
                    type={selectedMarketplaceBusiness.business_type}
                    className="h-64 rounded-xl"
                  />
                  <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-black/75 px-3 py-2 text-xs text-white">
                    <Maximize2 className="size-4" />
                    Enlarge
                  </span>
                </button>

                <div>
                  <p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">
                    {selectedMarketplaceBusiness.business_type}
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {selectedMarketplaceBusiness.tagline ||
                      "Business listed on LifeBoost Marketplace."}
                  </p>
                  {selectedMarketplaceBusiness.region ? (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-muted">
                      <MapPin className="size-3" />
                      {selectedMarketplaceBusiness.region}
                    </p>
                  ) : null}
                </div>

                {businessMedia(selectedMarketplaceBusiness).length > 0 ? (
                  <div>
                    <h4 className="mb-3 font-display text-xl font-medium">Explore our work</h4>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {businessMedia(selectedMarketplaceBusiness).map((media, index) => (
                        <button
                          key={media.media_id}
                          type="button"
                          className="relative overflow-hidden rounded-xl text-left"
                          onClick={() =>
                            openMedia(
                              selectedMarketplaceBusiness.business_name,
                              businessMedia(selectedMarketplaceBusiness),
                              index,
                            )
                          }
                        >
                          {isVideo(media) ? (
                            <video
                              src={media.url}
                              muted
                              playsInline
                              preload="metadata"
                              className="aspect-square w-full object-cover"
                            />
                          ) : (
                            <img
                              src={media.url}
                              alt={media.name || selectedMarketplaceBusiness.business_name}
                              loading="lazy"
                              className="aspect-square w-full object-cover"
                            />
                          )}
                          <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/25 text-white">
                            {isVideo(media) ? <>▶ Play video</> : <Maximize2 className="size-6" />}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <Button
                  className="w-full"
                  onClick={() => {
                    contactBusiness(selectedMarketplaceBusiness.business_id);
                    openWhatsApp(
                      selectedMarketplaceBusiness.phone,
                      `Hi, I found ${selectedMarketplaceBusiness.business_name} on LifeBoost Marketplace.`,
                    );
                    toast.success(
                      `Opening WhatsApp for ${selectedMarketplaceBusiness.business_name}.`,
                    );
                  }}
                >
                  <MessageCircle className="size-4" />
                  Contact this business on WhatsApp
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* SHARED LARGE PHOTO / VIDEO VIEWER */}
      <Dialog
        open={Boolean(mediaViewer)}
        onOpenChange={(open) => {
          if (!open) closeMedia();
        }}
      >
        <DialogContent className="max-h-[95dvh] w-[95vw] max-w-6xl overflow-y-auto p-3 sm:p-5">
          {mediaViewer ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 pr-8">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={closeMedia}
                    aria-label="Back"
                  >
                    <ArrowLeft className="size-4" />
                    Back
                  </Button>

                  <DialogTitle className="min-w-0 flex-1 truncate">
                    {mediaViewer.title}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {mediaViewer.index + 1} / {mediaViewer.items.length}
                    </span>
                  </DialogTitle>
                </div>
              </DialogHeader>

              {(() => {
                const current = mediaViewer.items[mediaViewer.index];
                const video = isVideo(current);

                return (
                  <>
                    <div className="relative flex min-h-[35vh] max-h-[70dvh] items-center justify-center overflow-auto rounded-xl bg-black">
                      {video ? (
                        <video
                          key={current.url}
                          src={current.url}
                          controls
                          autoPlay
                          playsInline
                          className="max-h-[70dvh] max-w-full object-contain"
                        />
                      ) : (
                        <img
                          key={current.url}
                          src={current.url}
                          alt={current.name || mediaViewer.title}
                          draggable={false}
                          onDoubleClick={() => setZoom((value) => (value === 1 ? 2 : 1))}
                          style={{
                            transform: `scale(${zoom})`,
                            transformOrigin: "center center",
                          }}
                          className="max-h-[70dvh] max-w-full select-none object-contain transition-transform duration-200"
                        />
                      )}

                      {mediaViewer.index > 0 ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="absolute left-2 top-1/2 -translate-y-1/2"
                          onClick={() => changeMedia(mediaViewer.index - 1)}
                          aria-label="Previous media"
                        >
                          <ChevronLeft className="size-5" />
                        </Button>
                      ) : null}

                      {mediaViewer.index < mediaViewer.items.length - 1 ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="absolute right-2 top-1/2 -translate-y-1/2"
                          onClick={() => changeMedia(mediaViewer.index + 1)}
                          aria-label="Next media"
                        >
                          <ChevronRight className="size-5" />
                        </Button>
                      ) : null}
                    </div>

                    {!video ? (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={zoom <= 1}
                          onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
                          aria-label="Zoom out"
                        >
                          <Minus className="size-4" />
                        </Button>

                        <span className="min-w-16 text-center text-sm tabular-nums">
                          {Math.round(zoom * 100)}%
                        </span>

                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={zoom >= 3}
                          onClick={() => setZoom((value) => Math.min(3, value + 0.5))}
                          aria-label="Zoom in"
                        >
                          <Plus className="size-4" />
                        </Button>

                        <Button type="button" variant="outline" onClick={() => setZoom(1)}>
                          Reset zoom
                        </Button>

                        <span className="text-xs text-muted-foreground">
                          You can also double-click the photo.
                        </span>
                      </div>
                    ) : null}

                    {mediaViewer.items.length > 1 ? (
                      <div className="flex gap-2 overflow-x-auto py-2">
                        {mediaViewer.items.map((item, index) => (
                          <button
                            key={item.media_id}
                            type="button"
                            onClick={() => changeMedia(index)}
                            className={`relative size-16 shrink-0 overflow-hidden rounded-lg border-2 ${
                              index === mediaViewer.index ? "border-primary" : "border-transparent"
                            }`}
                            aria-label={`Show media ${index + 1}`}
                            aria-current={index === mediaViewer.index ? "true" : undefined}
                          >
                            {isVideo(item) ? (
                              <video
                                src={item.url}
                                muted
                                playsInline
                                preload="metadata"
                                className="size-full object-cover"
                              />
                            ) : (
                              <img
                                src={item.url}
                                alt={item.name || ""}
                                loading="lazy"
                                className="size-full object-cover"
                              />
                            )}
                            {isVideo(item) ? (
                              <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white">
                                ▶
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
