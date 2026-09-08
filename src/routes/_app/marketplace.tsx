import { createFileRoute } from "@tanstack/react-router";
import {
  BriefcaseBusiness,
  Building2,
  Eye,
  MapPin,
  MessageCircle,
  Search,
  Store,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { ListingCover } from "@/components/listing-cover";
import { PageHeader } from "@/components/page-header";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { initials, money } from "@/lib/format";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/marketplace")({
  component: MarketplacePage,
});

function openWhatsApp(phone: string, text: string) {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  const number = digits.startsWith("0") ? `254${digits.slice(1)}` : digits;
  if (number && typeof window !== "undefined") {
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");
  }
}

function MarketplacePage() {
  const {
    marketplace,
    marketProfessionals,
    marketBusinesses,
    viewAsset,
    contactAsset,
    viewProfessional,
    contactProfessional,
    viewBusiness,
    contactBusiness,
  } = useLife();
  const [tab, setTab] = useState("assets");
  const [q, setQ] = useState("");
  const [businessDetailId, setBusinessDetailId] = useState<string | null>(null);
  const seen = useRef(new Set<string>());

  const ql = q.trim().toLowerCase();
  const assets = marketplace.filter((a) =>
    `${a.name} ${a.type} ${a.location} ${a.notes}`.toLowerCase().includes(ql),
  );
  const pros = marketProfessionals.filter((p) =>
    `${p.name} ${p.role} ${p.location} ${p.business_name}`.toLowerCase().includes(ql),
  );
  const firms = marketBusinesses.filter((b) =>
    `${b.business_name} ${b.tagline} ${b.region}`.toLowerCase().includes(ql),
  );
  const selectedMarketplaceBusiness = businessDetailId
    ? marketBusinesses.find((b) => b.business_id === businessDetailId) ?? null
    : null;

  function once(key: string, fn: () => void) {
    if (seen.current.has(key)) return;
    seen.current.add(key);
    fn();
  }

  return (
    <>
      <PageHeader
        eyebrow="Public listings"
        title="Marketplace"
        subtitle="Assets, professionals and businesses listed by LifeBoost users."
      />
      <div className="mb-4 flex h-11 items-center gap-2 rounded-lg bg-paper px-3 shadow-border">
        <Search className="size-4 text-ink-faint" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, role, location…"
          className="h-full border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-3 p-1">
          <TabsTrigger value="assets">Assets ({assets.length})</TabsTrigger>
          <TabsTrigger value="professionals">Pros ({pros.length})</TabsTrigger>
          <TabsTrigger value="businesses">Firms ({firms.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="assets">
          {assets.length === 0 ? (
            <EmptyState icon={Store} text={q ? "No assets match." : "No assets listed yet."} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {assets.map((asset) => (
                <Card
                  key={asset.asset_id}
                  className="overflow-hidden p-0"
                  onMouseEnter={() => once(`a:${asset.asset_id}`, () => viewAsset(asset.asset_id))}
                >
                  <ListingCover
                    src={asset.image_url}
                    alt={asset.name}
                    type={asset.type}
                    className="h-44"
                  />
                  <div className="flex flex-col gap-2 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">
                        {asset.type}
                      </p>
                      <Badge>Asset</Badge>
                    </div>
                    <h3 className="font-display text-xl font-medium tracking-tight">{asset.name}</h3>
                    <p className="font-display text-2xl font-medium tabular-nums">
                      {money(asset.value)}
                    </p>
                    {asset.notes ? (
                      <p className="text-sm text-ink-muted">{asset.notes}</p>
                    ) : null}
                    {(asset.gallery?.length || 0) > 1 ? (
                      <div className="grid grid-cols-4 gap-1.5">
                        {asset.gallery.slice(0, 4).map((media) =>
                          media.media_type === "video" ? (
                            <video
                              key={media.media_id}
                              src={media.url}
                              className="aspect-square w-full rounded-md object-cover"
                              muted
                            />
                          ) : (
                            <img
                              key={media.media_id}
                              src={media.url}
                              alt={media.name || asset.name}
                              className="aspect-square w-full rounded-md object-cover"
                            />
                          ),
                        )}
                      </div>
                    ) : null}
                    <p className="inline-flex items-center gap-1 text-xs text-ink-muted">
                      <MapPin className="size-3" />
                      {asset.location || "Location not provided"}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                        <Eye className="size-3.5" /> {asset.views || 0} views
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                        <MessageCircle className="size-3.5" /> {asset.whatsapp_clicks || 0}
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
                      Contact on WhatsApp
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="professionals">
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
                  className="p-5"
                  onMouseEnter={() => once(`p:${p.employee_id}`, () => viewProfessional(p.employee_id))}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex size-12 items-center justify-center rounded-lg bg-leaf font-display text-lg font-medium text-forest">
                      {initials(p.name)}
                    </div>
                    <Badge tone="amber">Professional</Badge>
                  </div>
                  <h3 className="font-display text-xl font-medium tracking-tight">{p.name}</h3>
                  <p className="text-sm text-ink-muted">
                    {p.role}
                    {p.business_name ? ` · ${p.business_name}` : ""}
                  </p>
                  {p.location ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink-muted">
                      <MapPin className="size-3" /> {p.location}
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center gap-3 text-xs text-ink-muted">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="size-3.5" /> {p.views}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="size-3.5" /> {p.whatsapp_clicks}
                    </span>
                  </div>
                  <Button
                    className="mt-4 w-full"
                    onClick={() => {
                      contactProfessional(p.employee_id);
                      openWhatsApp(p.phone, `Hi ${p.name}, I found you on LifeBoost Marketplace.`);
                      toast.success(`Opening WhatsApp for ${p.name}.`);
                    }}
                  >
                    <MessageCircle className="size-4" />
                    Contact on WhatsApp
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="businesses">
          {firms.length === 0 ? (
            <EmptyState icon={Building2} text={q ? "No businesses match." : "No businesses listed yet."} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {firms.map((b) => (
                <Card
                  key={b.business_id}
                  className="cursor-pointer overflow-hidden p-0 transition hover:-translate-y-0.5"
                  onMouseEnter={() => once(`b:${b.business_id}`, () => viewBusiness(b.business_id))}
                  onClick={() => setBusinessDetailId(b.business_id)}
                >
                  <ListingCover
                    src={b.image_url}
                    alt={b.business_name}
                    type={b.business_type}
                    className="h-40"
                  />
                  <div className="flex flex-col gap-2 p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">
                        {b.business_type}
                      </p>
                      <Badge>Business</Badge>
                    </div>
                    <h3 className="font-display text-xl font-medium tracking-tight">
                      {b.business_name}
                    </h3>
                    <p className="text-sm text-ink-muted">{b.tagline || b.business_type}</p>
                    {b.region ? (
                      <p className="inline-flex items-center gap-1 text-xs text-ink-muted">
                        <MapPin className="size-3" /> {b.region}
                      </p>
                    ) : null}
                    <div className="mt-1 flex items-center gap-3 text-xs text-ink-muted">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="size-3.5" /> {b.views}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="size-3.5" /> {b.whatsapp_clicks}
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

      <Dialog open={Boolean(selectedMarketplaceBusiness)} onOpenChange={(open) => !open && setBusinessDetailId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {selectedMarketplaceBusiness ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">{selectedMarketplaceBusiness.business_name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-5">
                <ListingCover
                  src={selectedMarketplaceBusiness.image_url}
                  alt={selectedMarketplaceBusiness.business_name}
                  type={selectedMarketplaceBusiness.business_type}
                  className="h-64 rounded-xl"
                />
                <div>
                  <p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">{selectedMarketplaceBusiness.business_type}</p>
                  <p className="mt-1 text-sm text-ink-muted">{selectedMarketplaceBusiness.tagline || "Business listed on LifeBoost Marketplace."}</p>
                  {selectedMarketplaceBusiness.region ? <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-muted"><MapPin className="size-3" /> {selectedMarketplaceBusiness.region}</p> : null}
                </div>
                {(selectedMarketplaceBusiness.gallery?.length || 0) > 1 ? (
                  <div>
                    <h4 className="mb-3 font-medium">Photos & videos</h4>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {(selectedMarketplaceBusiness.gallery || []).map((media) =>
                        media.media_type === "video" ? (
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
                            alt={media.name || selectedMarketplaceBusiness.business_name}
                            className="aspect-square w-full rounded-xl object-cover"
                          />
                        ),
                      )}
                    </div>
                  </div>
                ) : null}
                <Button
                  className="w-full"
                  onClick={() => {
                    contactBusiness(selectedMarketplaceBusiness.business_id);
                    openWhatsApp(selectedMarketplaceBusiness.phone, `Hi, I found ${selectedMarketplaceBusiness.business_name} on LifeBoost Marketplace.`);
                    toast.success(`Opening WhatsApp for ${selectedMarketplaceBusiness.business_name}.`);
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
    </>
  );
}
