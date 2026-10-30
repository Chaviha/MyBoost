import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Landmark } from "lucide-react";
import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AskPanel } from "@/components/ask-panel";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
        title="LifeBoostSME"
        subtitle="Your real financial growth, opportunities, assistant, and marketplace — without demo data."
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <BalanceCard />
        </div>
        <GrowthCard />
        <div className="lg:col-span-5">
          <AskPanel />
        </div>
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

function BalanceCard() {
  const { myAssets, totalAssetValue, liabilities, netWorth } = useLife();
  const topAssets = [...myAssets].sort((a, b) => Number(b.value || 0) - Number(a.value || 0)).slice(0, 3);
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-ink-muted uppercase">Balance sheet</p>
          <h2 className="font-display text-2xl font-medium">Assets &amp; records</h2>
        </div>
        <Landmark className="size-5 text-ink-faint" />
      </div>
      <p className="mt-4 text-xs text-ink-muted">Net worth</p>
      <p className="font-display text-3xl font-medium tracking-tight">{money(netWorth)}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-canvas p-3"><p className="text-xs text-ink-muted">Assets</p><p className="font-medium">{money(totalAssetValue)}</p></div>
        <div className="rounded-lg bg-canvas p-3"><p className="text-xs text-ink-muted">Liabilities</p><p className="font-medium">{money(liabilities)}</p></div>
      </div>
      {topAssets.length === 0 ? (
        <div className="mt-4 rounded-lg bg-canvas p-4 text-sm text-ink-muted">No assets recorded yet.</div>
      ) : (
        <div className="mt-4 space-y-2">
          {topAssets.map((asset) => (
            <div key={asset.asset_id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{asset.name}</span>
              <span className="text-ink-muted">{money(asset.value)}</span>
            </div>
          ))}
        </div>
      )}
      <Link to="/assets" className="mt-auto pt-4"><Button variant="ghost">View all records<ArrowUpRight className="size-4" /></Button></Link>
    </Card>
  );
}
