
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Gift, Landmark, Store } from "lucide-react";
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
import type { Asset } from "@/lib/types";

export const Route = createFileRoute("/_app/")({
  component: OverviewPage,
});

function OverviewPage() {
  const life = useLife();
  const { currentUser, workspace } = life;

  // Owner workspace: only Growth rate, B/S assets owned by owner, and Ask LifeBoost
  if (workspace === "owner") {
    return (
      <>
        <PageHeader
          eyebrow={`Good to see you, ${firstName(currentUser.name)}`}
          title="Owner workspace"
          subtitle="Growth rate, businesses & assets you own, and Ask LifeBoost."
        />
        <div className="grid gap-4 lg:grid-cols-5">
          <GrowthCard />
          <div className="lg:col-span-2">
            <AskPanel />
          </div>
          <OwnerAssetsCard />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`Good to see you, ${firstName(currentUser.name)}`}
        title="LifeBoostSME"
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
          <p className="mt-1 font-display text-3xl font-medium tracking-tight">
            {latest === undefined ? "—" : `${latest >= 0 ? "+" : ""}${latest.toFixed(1)}%`}
          </p>
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
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--color-ink-muted)", fontSize: 12 }}
              />
              <YAxis hide />
              <Tooltip
                formatter={(value, name) =>
                  name === "growth"
                    ? [`${Number(value).toFixed(1)}%`, "Growth"]
                    : [money(Number(value)), "Revenue"]
                }
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--color-line)",
                  background: "var(--color-paper)",
                  fontSize: 13,
                }}
              />
              <Line
                type="monotone"
                dataKey="growth"
                stroke="var(--color-forest)"
                strokeWidth={3}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg bg-canvas px-6 text-center text-sm text-ink-muted">
            Record at least two months of sales to see a real growth-rate trend. LifeBoost will not
            invent a growth percentage.
          </div>
        )}
      </div>
    </Card>
  );
}

/** Balance-sheet style card: businesses the owner owns + assets they own, in one place. */
function OwnerAssetsCard() {
  const { myAssets, visibleBusinesses, state } = useLife();

  const businesses = useMemo(() => {
    return visibleBusinesses.map((business) => {
      const revenue = state.sales
        .filter((s) => s.business_id === business.business_id)
        .reduce((sum, s) => sum + Number(s.total || 0), 0);
      const expenses = state.expenses
        .filter((e) => e.business_id === business.business_id)
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const assetValue = myAssets
        .filter((a: Asset) => a.business_id === business.business_id)
        .reduce((sum, a) => sum + Number(a.value || 0), 0);
      return {
        ...business,
        revenue,
        expenses,
        profit: revenue - expenses,
        assetValue,
      };
    });
  }, [visibleBusinesses, state.sales, state.expenses, myAssets]);

  const { totalAssets, personalAssets, businessAssets, assetCount } = useMemo(() => {
    const personal = myAssets.filter((a: Asset) => !a.business_id);
    const business = myAssets.filter((a: Asset) => Boolean(a.business_id));
    return {
      totalAssets: myAssets.reduce((s: number, a: Asset) => s + Number(a.value || 0), 0),
      personalAssets: personal.reduce((s: number, a: Asset) => s + Number(a.value || 0), 0),
      businessAssets: business.reduce((s: number, a: Asset) => s + Number(a.value || 0), 0),
      assetCount: myAssets.length,
    };
  }, [myAssets]);

  const totalRevenue = businesses.reduce((s, b) => s + b.revenue, 0);
  const totalProfit = businesses.reduce((s, b) => s + b.profit, 0);

  const topAssets = useMemo(
    () =>
      [...myAssets]
        .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
        .slice(0, 6),
    [myAssets],
  );

  const businessName = (businessId: string) =>
    visibleBusinesses.find((b) => b.business_id === businessId)?.business_name || "Business";

  return (
    <Card className="flex flex-col p-5 lg:col-span-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-ink-muted uppercase">
            B/S · Businesses &amp; assets owned by owner
          </p>
          <p className="mt-1 font-display text-3xl font-medium tracking-tight">
            {money(totalAssets)}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {businesses.length} business{businesses.length === 1 ? "" : "es"} ·{" "}
            {assetCount} asset{assetCount === 1 ? "" : "s"} · Personal assets{" "}
            {money(personalAssets)} · Business assets {money(businessAssets)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Landmark className="size-5 text-ink-faint" />
          <Link to="/assets">
            <Button variant="ghost">Manage assets</Button>
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-canvas p-4">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Businesses</p>
          <p className="mt-1 font-display text-2xl font-medium tabular-nums">{businesses.length}</p>
        </div>
        <div className="rounded-lg bg-canvas p-4">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Total revenue</p>
          <p className="mt-1 font-display text-2xl font-medium tabular-nums">{money(totalRevenue)}</p>
        </div>
        <div className="rounded-lg bg-canvas p-4">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Total profit</p>
          <p className="mt-1 font-display text-2xl font-medium tabular-nums">{money(totalProfit)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="border-b border-line bg-canvas px-4 py-3">
            <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Businesses</p>
          </div>
          {businesses.length === 0 ? (
            <div className="p-4 text-sm text-ink-muted">No businesses yet.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                <tr>
                  <th className="px-4 py-2">Business</th>
                  <th className="px-4 py-2 text-right">Revenue</th>
                  <th className="px-4 py-2 text-right">Profit</th>
                  <th className="px-4 py-2 text-right">Assets</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((b) => (
                  <tr key={b.business_id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <p className="font-medium">{b.business_name}</p>
                      <p className="text-xs text-ink-muted">
                        {b.business_type || "Business"}
                        {b.region ? ` · ${b.region}` : ""}
                        {b.status ? ` · ${b.status}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(b.revenue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(b.profit)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(b.assetValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-line">
          <div className="border-b border-line bg-canvas px-4 py-3">
            <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Assets</p>
          </div>
          {topAssets.length === 0 ? (
            <div className="p-4 text-sm text-ink-muted">
              No assets recorded yet. Add them under Assets.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                <tr>
                  <th className="px-4 py-2">Asset</th>
                  <th className="px-4 py-2">Ownership</th>
                  <th className="px-4 py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {topAssets.map((asset) => (
                  <tr key={asset.asset_id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <p className="font-medium">{asset.name}</p>
                      <p className="text-xs text-ink-muted">{asset.type || "Asset"}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {asset.business_id ? businessName(asset.business_id) : "Personal"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(asset.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Card>
  );
}

function OffersCard() {
  const { myOffers } = useLife();
  return (
    <Card className="flex flex-col p-5 lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-ink-muted uppercase">Offers</p>
          <h2 className="font-display text-2xl font-medium">Opportunities for you</h2>
        </div>
        <Gift className="size-5 text-ink-faint" />
      </div>
      {myOffers.length === 0 ? (
        <div className="mt-5 rounded-lg bg-canvas p-5 text-sm text-ink-muted">
          No offers yet. Offers will appear here when another LifeBoost user sends one to this
          account.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {myOffers.slice(0, 3).map((offer) => (
            <div key={offer.offer_id} className="rounded-lg bg-canvas p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{offer.title}</p>
                <Badge tone={offer.status === "Active" ? "forest" : "amber"}>{offer.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                {offer.from} · {money(offer.amount)}
              </p>
            </div>
          ))}
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
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-ink-muted uppercase">
            Marketplace
          </p>
          <h2 className="font-display text-2xl font-medium">Discover businesses</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Only real businesses that have chosen to list themselves appear here.
          </p>
        </div>
        <Link to="/marketplace">
          <Button variant="ghost">
            <Store className="size-4" />
            View marketplace
          </Button>
        </Link>
      </div>
      {businesses.length === 0 ? (
        <div className="border-t border-line px-5 py-8 text-center text-sm text-ink-muted">
          No businesses are listed yet.
        </div>
      ) : (
        <div className="grid gap-3 border-t border-line p-5 sm:grid-cols-3">
          {businesses.map((business) => (
            <Link
              key={business.business_id}
              to="/marketplace"
              className="overflow-hidden rounded-xl border border-line bg-paper transition hover:-translate-y-0.5"
            >
              <ListingCover
                src={business.image_url}
                alt={business.business_name}
                type={business.business_type}
                className="h-32"
              />
              <div className="p-4">
                <p className="text-xs text-forest">{business.business_type}</p>
                <p className="mt-1 font-display text-lg font-medium">{business.business_name}</p>
                <p className="mt-1 truncate text-xs text-ink-muted">
                  {business.tagline || business.region || "Listed on LifeBoost"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}