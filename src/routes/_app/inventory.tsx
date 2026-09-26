import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { AccessDenied } from "@/components/access-denied";
import { Toolbar } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/format";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/inventory")({
  component: InventoryPage,
});

function InventoryPage() {
  const { selectedBusiness, businessProducts, can } = useLife();

  if (!can("view_products")) {
    return <AccessDenied need="Inventory is for business owners." />;
  }
  if (!selectedBusiness) {
    return <EmptyState icon={Package} text="Add a business first." />;
  }

  const products = businessProducts ?? [];
  const lowStock = products.filter((p) => (p.stock ?? 0) <= 5);
  const totalUnits = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  const totalValue = products.reduce(
    (sum, p) => sum + (Number(p.stock) || 0) * (Number(p.cost_price) || 0),
    0,
  );

  return (
    <>
      <Toolbar
        title="Inventory"
        subtitle={`Stock levels for ${selectedBusiness.business_name}. Adjust stock from the Products page for now.`}
      />

      {products.length === 0 ? (
        <EmptyState icon={Package} text="No products yet — add products to track inventory." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
                SKUs
              </p>
              <p className="mt-1 font-display text-2xl font-medium tabular-nums">
                {products.length}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
                Total units
              </p>
              <p className="mt-1 font-display text-2xl font-medium tabular-nums">{totalUnits}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
                Cost value
              </p>
              <p className="mt-1 font-display text-2xl font-medium tabular-nums">
                {money(totalValue)}
              </p>
            </Card>
          </div>

          {lowStock.length > 0 ? (
            <p className="text-sm text-ink-muted">
              <span className="font-medium text-ink">{lowStock.length}</span> item
              {lowStock.length === 1 ? "" : "s"} at or below 5 units.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {products
              .slice()
              .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0))
              .map((p) => {
                const stock = Number(p.stock) || 0;
                const low = stock <= 5;
                return (
                  <Card key={p.product_id} className="flex flex-col gap-2 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium leading-snug">{p.name}</h3>
                      <Badge tone={low ? "neutral" : "forest"}>
                        {stock} {p.unit || "units"}
                      </Badge>
                    </div>
                    <p className="text-xs text-ink-muted">
                      {p.category || "Uncategorised"} · Cost {money(p.cost_price)} · Sell{" "}
                      {money(p.selling_price)}
                    </p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                      <div
                        className={`h-full rounded-full ${low ? "bg-ink-muted" : "bg-forest"}`}
                        style={{ width: `${Math.min(100, (stock / 160) * 100)}%` }}
                      />
                    </div>
                  </Card>
                );
              })}
          </div>
        </div>
      )}
    </>
  );
}
