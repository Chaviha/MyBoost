import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Gift, Store } from "lucide-react";
import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AskPanel } from "@/components/ask-panel";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListingCover } from "@/components/listing-cover";
import { firstName, money } from "@/lib/format";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/")({
  component: OverviewPage,
});

function OverviewPage() {
  const life = useLife();
  const { currentUser } = life;

  return (
    <>
      <PageHeader
        eyebrow={`Good to see you, ${firstName(currentUser.name)}`}
        title="LifeBoost"
        subtitle="Your real financial growth, opportunities, assistant, and marketplace — without demo data."
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <GrowthCard />
        <div className="lg:col-span-2">
          <AskPanel />
        </div>
        <OffersCard />
        <MarketplaceCard />
      </div>
    </>
  );
}

function GrowthCard() {
  const { state } = useLife();
  const data = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return { date, label: date.toLocaleDateString("en", { month: "short" }) };
    });

    const revenueByMonth = months.map(({ date, label }) => {
      const value = state.sales
        .filter((sale) => {
          const d = new Date(sale.date);
          return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth();
        })
        .reduce((sum, sale) => sum + Number(sale.total || 0), 0);
      return { month: label, revenue: value };
    });

    return revenueByMonth.map((point, index) => {
      const previous = revenueByMonth[index - 1]?.revenue ?? 0;
      const growth = previous > 0 ? ((point.revenue - previous) / previous) * 100 : null;
      return { ...point, growth };
    });
  }, [state.sales]);

  const hasHistory = data.some((point) => point.growth !== null);
  const latest = [...data].reverse().find((point) => point.growth !== null)?.growth;

  return (
    <Card className="p-5 lg:col-span-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-ink-muted uppercase">Growth rate</p>
          <p className="mt-1 font-display text-3xl font-medium tracking-tight">{latest === undefined ? "—" : `${latest >= 0 ? "+" : ""}${latest.toFixed(1)}%`}</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-ink-muted">
            {latest !== undefined ? <ArrowUpRight className="size-4" /> : null}
            Month-over-month sales growth from your recorded transactions.
          </p>
        </div>
        <Badge tone="forest">Real data</Badge>
      </div>
      <div className="mt-4 h-48">
        {hasHistory ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "var(--color-ink-muted)", fontSize: 12 }} />
              <YAxis hide />
              <Tooltip
                formatter={(value, name) => name === "growth" ? [`${Number(value).toFixed(1)}%`, "Growth"] : [money(Number(value)), "Revenue"]}
                contentStyle={{ borderRadius: 12, border: "1px solid var(--color-line)", background: "var(--color-paper)", fontSize: 13 }}
              />
              <Line type="monotone" dataKey="growth" stroke="var(--color-forest)" strokeWidth={3} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg bg-canvas px-6 text-center text-sm text-ink-muted">
            Record at least two months of sales to see a real growth-rate trend. LifeBoost will not invent a growth percentage.
          </div>
        )}
      </div>
    </Card>
  );
}

function OffersCard() {
  const { myOffers } = useLife();
  return (
    <Card className="flex flex-col p-5 lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-medium tracking-[0.14em] text-ink-muted uppercase">Offers</p><h2 className="font-display text-2xl font-medium">Opportunities for you</h2></div>
        <Gift className="size-5 text-ink-faint" />
      </div>
      {myOffers.length === 0 ? (
        <div className="mt-5 rounded-lg bg-canvas p-5 text-sm text-ink-muted">No offers yet. Offers will appear here when another LifeBoost user sends one to this account.</div>
      ) : (
        <div className="mt-4 space-y-3">
          {myOffers.slice(0, 3).map((offer) => <div key={offer.offer_id} className="rounded-lg bg-canvas p-4"><div className="flex items-center justify-between gap-2"><p className="font-medium">{offer.title}</p><Badge tone={offer.status === "Active" ? "forest" : "amber"}>{offer.status}</Badge></div><p className="mt-1 text-sm text-ink-muted">{offer.from} · {money(offer.amount)}</p></div>)}
        </div>
      )}
    </Card>
  );
}

function MarketplaceCard() {
  const { publicMarketplace } = useLife();
  const businesses = publicMarketplace.businesses.slice(0, 3);
  return (
    <Card className="overflow-hidden p-0 lg:col-span-5">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div><p className="text-xs font-medium tracking-[0.14em] text-ink-muted uppercase">Marketplace</p><h2 className="font-display text-2xl font-medium">Discover businesses</h2><p className="mt-1 text-sm text-ink-muted">Only real businesses that have chosen to list themselves appear here.</p></div>
        <Link to="/marketplace"><Button variant="ghost"><Store className="size-4" />View marketplace</Button></Link>
      </div>
      {businesses.length === 0 ? (
        <div className="border-t border-line px-5 py-8 text-center text-sm text-ink-muted">No businesses are listed yet.</div>
      ) : (
        <div className="grid gap-3 border-t border-line p-5 sm:grid-cols-3">
          {businesses.map((business) => <Link key={business.business_id} to="/marketplace" className="overflow-hidden rounded-xl border border-line bg-paper transition hover:-translate-y-0.5"><ListingCover src={business.image_url} alt={business.business_name} type={business.business_type} className="h-32" /><div className="p-4"><p className="text-xs text-forest">{business.business_type}</p><p className="mt-1 font-display text-lg font-medium">{business.business_name}</p><p className="mt-1 truncate text-xs text-ink-muted">{business.tagline || business.region || "Listed on LifeBoost"}</p></div></Link>)}
        </div>
      )}
    </Card>
  );
}
