import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Eye, MapPin, MessageCircle, Search, Store } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListingCover } from "@/components/listing-cover";
import { useLife } from "@/lib/store";
import type { Business } from "@/lib/types";

function openWhatsApp(phone: string, text: string) {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  const number = digits.startsWith("0") ? `254${digits.slice(1)}` : digits;
  if (number && typeof window !== "undefined") {
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");
  }
}

export function PublicMarketplace() {
  const { publicMarketplace, refreshPublicMarketplace } = useLife();
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const timer = window.setInterval(() => void refreshPublicMarketplace(), 30000);
    return () => window.clearInterval(timer);
  }, [refreshPublicMarketplace]);

  const businesses = useMemo(() => {
    const query = q.trim().toLowerCase();
    return publicMarketplace.businesses.filter((b) =>
      `${b.business_name} ${b.business_type} ${b.region} ${b.tagline}`.toLowerCase().includes(query),
    );
  }, [publicMarketplace.businesses, q]);

  const selected = selectedId
    ? publicMarketplace.businesses.find((b) => b.business_id === selectedId) ?? null
    : null;

  async function viewBusiness(id: string) {
    if (seen.current.has(id)) return;
    seen.current.add(id);
    await fetch(`/api/public/marketplace/businesses/${encodeURIComponent(id)}/view`, { method: "POST" });
    void refreshPublicMarketplace();
  }

  async function contactBusiness(business: Business) {
    await fetch(`/api/public/marketplace/businesses/${encodeURIComponent(business.business_id)}/contact`, { method: "POST" });
    openWhatsApp(business.phone, `Hi, I found ${business.business_name} on LifeBoost Marketplace.`);
    void refreshPublicMarketplace();
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-md bg-forest font-display font-semibold text-forest-fg">L</span>
            <span><strong className="font-display text-lg">LifeBoost</strong><span className="ml-2 hidden text-xs text-ink-muted sm:inline">Marketplace</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <a href="/?auth=login" className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-ink-soft hover:bg-canvas">Sign in</a>
            <a href="/?auth=register" className="inline-flex h-9 items-center rounded-md bg-forest px-3 text-sm font-medium text-forest-fg">Create account</a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="max-w-3xl">
          <p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">Open marketplace</p>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight sm:text-5xl">Discover real businesses on LifeBoost.</h1>
          <p className="mt-3 text-base text-ink-muted">Businesses appear here only when their owners choose to list them. No demo listings.</p>
        </div>

        <div className="mt-7 flex h-12 items-center gap-2 rounded-lg bg-paper px-3 shadow-border">
          <Search className="size-4 text-ink-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search businesses, categories, locations…" className="h-full border-0 bg-transparent shadow-none focus-visible:ring-0" />
        </div>

        <section className="mt-8">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div><p className="text-xs font-medium tracking-[0.14em] text-ink-muted uppercase">Businesses</p><h2 className="font-display text-2xl font-medium">Marketplace listings</h2></div>
            <span className="text-sm text-ink-muted">{businesses.length} listed</span>
          </div>
          {businesses.length === 0 ? (
            <Card className="p-10 text-center"><Building2 className="mx-auto size-8 text-ink-faint" /><p className="mt-3 font-medium">{q ? "No businesses match your search." : "No businesses have listed themselves yet."}</p><p className="mt-1 text-sm text-ink-muted">Create an account and list your business when you are ready.</p></Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {businesses.map((b) => (
                <Card key={b.business_id} className="cursor-pointer overflow-hidden p-0 transition hover:-translate-y-0.5" onMouseEnter={() => void viewBusiness(b.business_id)} onClick={() => setSelectedId(b.business_id)}>
                  <ListingCover src={b.image_url} alt={b.business_name} type={b.business_type} className="h-48" />
                  <div className="space-y-2 p-5">
                    <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">{b.business_type}</p><Badge>Business</Badge></div>
                    <h3 className="font-display text-xl font-medium tracking-tight">{b.business_name}</h3>
                    <p className="text-sm text-ink-muted">{b.tagline || "Business listed on LifeBoost Marketplace."}</p>
                    {b.region ? <p className="inline-flex items-center gap-1 text-xs text-ink-muted"><MapPin className="size-3" />{b.region}</p> : null}
                    <div className="flex items-center gap-3 pt-1 text-xs text-ink-muted"><span className="inline-flex items-center gap-1"><Eye className="size-3.5" />{b.views || 0}</span><span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" />{b.whatsapp_clicks || 0}</span></div>
                    <Button className="mt-1 w-full" onClick={(event) => { event.stopPropagation(); void contactBusiness(b); }}>Contact on WhatsApp</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {selected ? <><DialogHeader><DialogTitle className="font-display text-2xl">{selected.business_name}</DialogTitle></DialogHeader><div className="space-y-5"><ListingCover src={selected.image_url} alt={selected.business_name} type={selected.business_type} className="h-64 rounded-xl" /><div><p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">{selected.business_type}</p><p className="mt-1 text-sm text-ink-muted">{selected.tagline || "Business listed on LifeBoost Marketplace."}</p>{selected.region ? <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-muted"><MapPin className="size-3" />{selected.region}</p> : null}</div>{selected.gallery?.length ? <div><h4 className="mb-3 font-medium">Photos & videos</h4><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{selected.gallery.map((media) => media.media_type === "video" ? <video key={media.media_id} src={media.url} controls className="aspect-square w-full rounded-xl object-cover" /> : <img key={media.media_id} src={media.url} alt={media.name || selected.business_name} className="aspect-square w-full rounded-xl object-cover" />)}</div></div> : null}<Button className="w-full" onClick={() => void contactBusiness(selected)}><MessageCircle className="size-4" />Contact this business on WhatsApp</Button></div></> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
