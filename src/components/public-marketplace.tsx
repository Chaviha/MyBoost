import { useEffect, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, Building2, Eye, MapPin, MessageCircle, Search, Store } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListingCover } from "@/components/listing-cover";
import { useLife } from "@/lib/store";
import { initials, money } from "@/lib/format";
import type { Asset, Business, Employee } from "@/lib/types";

function openWhatsApp(phone: string, text: string) {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  const number = digits.startsWith("0") ? `254${digits.slice(1)}` : digits;
  if (number && typeof window !== "undefined") window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");
}

export function PublicMarketplace() {
  const { publicMarketplace, refreshPublicMarketplace, viewAsset, contactAsset, viewProfessional, contactProfessional } = useLife();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("businesses");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState(false);
  const seen = useRef(new Set<string>());

  const loadMarketplace = async () => {
    setLoading(true);
    const ok = await refreshPublicMarketplace();
    setServerError(!ok);
    setLoading(false);
  };

  useEffect(() => {
    void loadMarketplace();
    const timer = window.setInterval(() => void loadMarketplace(), 30000);
    const onFocus = () => void loadMarketplace();
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, []);

  const query = q.trim().toLowerCase();
  const businesses = useMemo(() => (publicMarketplace.businesses as Business[]).filter(b => `${b.business_name} ${b.business_type} ${b.region} ${b.tagline}`.toLowerCase().includes(query)), [publicMarketplace.businesses, query]);
  const assets = useMemo(() => (publicMarketplace.assets as Asset[]).filter(a => `${a.name} ${a.type} ${a.location} ${a.notes}`.toLowerCase().includes(query)), [publicMarketplace.assets, query]);
  const professionals = useMemo(() => (publicMarketplace.professionals as Array<Employee & { business_name?: string }>).filter(p => `${p.name} ${p.role} ${p.location} ${p.business_name || ""}`.toLowerCase().includes(query)), [publicMarketplace.professionals, query]);
  const selected = selectedId ? businesses.find(b => b.business_id === selectedId) ?? null : null;

  function once(key: string, fn: () => void) {
    if (seen.current.has(key)) return;
    seen.current.add(key);
    fn();
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5"><span className="flex size-10 items-center justify-center rounded-md bg-forest font-display font-semibold text-forest-fg">L</span><span><strong className="font-display text-lg">LifeBoost</strong><span className="ml-2 hidden text-xs text-ink-muted sm:inline">Marketplace</span></span></Link>
          <div className="flex items-center gap-2"><a href="/?auth=login" className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-ink-soft hover:bg-canvas">Sign in</a><a href="/?auth=register" className="inline-flex h-9 items-center rounded-md bg-forest px-3 text-sm font-medium text-forest-fg">Create account</a></div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="max-w-3xl"><p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">Open marketplace</p><h1 className="mt-2 font-display text-4xl font-medium tracking-tight sm:text-5xl">Discover real businesses, assets and professionals on LifeBoost.</h1><p className="mt-3 text-base text-ink-muted">Only listings created and published by LifeBoost users appear here.</p></div>
        <div className="mt-7 flex h-12 items-center gap-2 rounded-lg bg-paper px-3 shadow-border"><Search className="size-4 text-ink-faint" /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search businesses, assets, professionals, locations…" className="h-full border-0 bg-transparent shadow-none focus-visible:ring-0" /></div>

        {serverError ? <Card className="mt-8 p-10 text-center"><p className="font-medium">Marketplace is temporarily unavailable.</p><p className="mt-1 text-sm text-ink-muted">Make sure the LifeBoost API is running on port 3001.</p><Button className="mt-4" onClick={() => void loadMarketplace()}>Try again</Button></Card> : loading ? <Card className="mt-8 p-10 text-center"><p className="text-sm text-ink-muted">Loading marketplace listings…</p></Card> : (
          <Tabs value={tab} onValueChange={setTab} className="mt-8">
            <TabsList className="grid h-auto w-full grid-cols-3 p-1"><TabsTrigger value="businesses">Businesses ({businesses.length})</TabsTrigger><TabsTrigger value="assets">Assets ({assets.length})</TabsTrigger><TabsTrigger value="professionals">Professionals ({professionals.length})</TabsTrigger></TabsList>

            <TabsContent value="businesses">
              {businesses.length === 0 ? <Card className="p-10 text-center"><Building2 className="mx-auto size-8 text-ink-faint" /><p className="mt-3 font-medium">{q ? "No businesses match your search." : "No businesses have listed themselves yet."}</p></Card> : <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{businesses.map(b => <Card key={b.business_id} className="cursor-pointer overflow-hidden p-0 transition hover:-translate-y-0.5" onMouseEnter={() => once(`b:${b.business_id}`, () => void fetch(`/api/public/marketplace/businesses/${encodeURIComponent(b.business_id)}/view`, { method: "POST" }))} onClick={() => setSelectedId(b.business_id)}><ListingCover src={b.image_url} alt={b.business_name} type={b.business_type} className="h-48" /><div className="space-y-2 p-5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">{b.business_type}</p><Badge tone={String(b.status).toLowerCase() === "closed" ? "amber" : "forest"}>{String(b.status).toLowerCase() === "closed" ? "Closed" : "Open"}</Badge></div><h3 className="font-display text-xl font-medium tracking-tight">{b.business_name}</h3><p className="text-sm text-ink-muted">{b.tagline || "Business listed on LifeBoost Marketplace."}</p>{b.region ? <p className="inline-flex items-center gap-1 text-xs text-ink-muted"><MapPin className="size-3" />{b.region}</p> : null}<Button className="mt-2 w-full" onClick={e => { e.stopPropagation(); openWhatsApp(b.phone, `Hi, I found ${b.business_name} on LifeBoost Marketplace.`); }}>Contact on WhatsApp</Button></div></Card>)}</div>}
            </TabsContent>

            <TabsContent value="assets">
              {assets.length === 0 ? <Card className="p-10 text-center"><Store className="mx-auto size-8 text-ink-faint" /><p className="mt-3 font-medium">{q ? "No assets match your search." : "No assets listed yet."}</p></Card> : <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{assets.map(a => <Card key={a.asset_id} className="overflow-hidden p-0" onMouseEnter={() => once(`a:${a.asset_id}`, () => viewAsset(a.asset_id))}><ListingCover src={a.image_url} alt={a.name} type={a.type} className="h-44" /><div className="space-y-2 p-5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">{a.type}</p><Badge tone="forest">{a.listing_type || "For sale"}</Badge></div><h3 className="font-display text-xl font-medium">{a.name}</h3><p className="font-display text-2xl font-medium tabular-nums">{money(a.value)}</p>{a.location ? <p className="inline-flex items-center gap-1 text-xs text-ink-muted"><MapPin className="size-3" />{a.location}</p> : null}<Button className="mt-2 w-full" onClick={() => { contactAsset(a.asset_id); openWhatsApp(a.phone, `Hi, I'm interested in your ${a.listing_type || "For sale"} listing "${a.name}" on LifeBoost Marketplace.`); }}>Contact on WhatsApp</Button></div></Card>)}</div>}
            </TabsContent>

            <TabsContent value="professionals">
              {professionals.length === 0 ? <Card className="p-10 text-center"><BriefcaseBusiness className="mx-auto size-8 text-ink-faint" /><p className="mt-3 font-medium">{q ? "No professionals match your search." : "No professionals listed yet."}</p></Card> : <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{professionals.map(p => <Card key={p.employee_id} className="p-5" onMouseEnter={() => once(`p:${p.employee_id}`, () => viewProfessional(p.employee_id))}><div className="mb-3 flex items-start justify-between gap-3"><div className="flex size-12 items-center justify-center rounded-lg bg-leaf font-display text-lg font-medium text-forest">{initials(p.name)}</div><Badge tone="amber">Professional</Badge></div><h3 className="font-display text-xl font-medium">{p.name}</h3><p className="text-sm text-ink-muted">{p.role}{p.business_name ? ` · ${p.business_name}` : ""}</p>{p.location ? <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink-muted"><MapPin className="size-3" />{p.location}</p> : null}<Button className="mt-4 w-full" onClick={() => { contactProfessional(p.employee_id); openWhatsApp(p.phone, `Hi ${p.name}, I found you on LifeBoost Marketplace.`); }}>Connect</Button></Card>)}</div>}
            </TabsContent>
          </Tabs>
        )}
      </main>

      <Dialog open={Boolean(selected)} onOpenChange={open => !open && setSelectedId(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">{selected ? <><DialogHeader><DialogTitle className="font-display text-2xl">{selected.business_name}</DialogTitle></DialogHeader><div className="space-y-5"><ListingCover src={selected.image_url} alt={selected.business_name} type={selected.business_type} className="h-64 rounded-xl" /><div><div className="flex items-center gap-2"><p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">{selected.business_type}</p><Badge tone={String(selected.status).toLowerCase() === "closed" ? "amber" : "forest"}>{String(selected.status).toLowerCase() === "closed" ? "Closed" : "Open"}</Badge></div><p className="mt-1 text-sm text-ink-muted">{selected.tagline || "Business listed on LifeBoost Marketplace."}</p>{selected.region ? <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-muted"><MapPin className="size-3" />{selected.region}</p> : null}</div><div><h4 className="mb-3 font-display text-xl font-medium">Explore our work</h4>{selected.gallery?.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{selected.gallery.map(media => media.media_type === "video" ? <video key={media.media_id} src={media.url} controls className="aspect-square w-full rounded-xl object-cover" /> : <img key={media.media_id} src={media.url} alt={media.name || selected.business_name} className="aspect-square w-full rounded-xl object-cover" />)}</div> : <p className="text-sm text-ink-muted">This business has not added work samples yet.</p>}</div><Button className="w-full" onClick={() => openWhatsApp(selected.phone, `Hi, I found ${selected.business_name} on LifeBoost Marketplace.`)}><MessageCircle className="size-4" />Contact this business on WhatsApp</Button></div></> : null}</DialogContent></Dialog>
    </div>
  );
}
