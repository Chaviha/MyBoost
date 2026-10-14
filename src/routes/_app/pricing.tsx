import { createFileRoute } from "@tanstack/react-router";
import { Calculator, History, Plus, Settings2, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { CatalogueSubnav } from "@/components/catalogue-subnav";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { MoreActions } from "@/components/more-actions";
import { Toolbar } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { money } from "@/lib/format";
import { smartProductPrice } from "@/lib/pricing-engine";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/pricing")({ component: SmartPricingPage });

function SmartPricingPage() {
  const {
    selectedBusiness,
    businessProducts,
    businessPriceHistory,
    businessLabourRates,
    businessTransportRates,
    pricingSettings,
    updateProduct,
    updatePricingSettings,
    addLabourRate,
    updateLabourRate,
    deleteLabourRate,
    addTransportRate,
    updateTransportRate,
    deleteTransportRate,
    can,
  } = useLife();
  const [labourOpen, setLabourOpen] = useState(false);
  const [transportOpen, setTransportOpen] = useState(false);

  if (!can("view_products")) return <AccessDenied need="Smart pricing is for businesses with catalogue access." />;
  if (!selectedBusiness) return <EmptyState icon={Calculator} text="Add a business first." />;

  const products = businessProducts.filter((p) => (p.item_kind || "product") !== "service");
  const references = products;
  const preview = useMemo(
    () => products.map((p) => ({ p, suggested: smartProductPrice(p, products, pricingSettings.default_markup_percent) })),
    [products, pricingSettings.default_markup_percent],
  );

  return (
    <>
      <Toolbar
        title="Smart Pricing"
        subtitle={`${selectedBusiness.business_name} · rules, price history and quotation defaults`}
      />
      <CatalogueSubnav />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">Product pricing rules</h2>
              <p className="text-xs text-ink-muted">The current catalogue price is still the source of truth. Rules only calculate a suggestion.</p>
            </div>
            <Badge tone="neutral">{products.length} items</Badge>
          </div>
          {products.length === 0 ? (
            <p className="text-sm text-ink-muted">Add products first, then configure family/reference pricing here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead className="border-b border-line text-xs text-ink-muted">
                  <tr>
                    <th className="px-2 py-2">Product</th>
                    <th className="px-2 py-2">Current</th>
                    <th className="px-2 py-2">Method</th>
                    <th className="px-2 py-2">Factor / ref.</th>
                    <th className="px-2 py-2">Suggested</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {preview.map(({ p, suggested }) => (
                    <tr key={p.product_id} className="border-b border-line last:border-0">
                      <td className="px-2 py-3">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-ink-muted">{p.category || "General"} · {p.unit}</div>
                      </td>
                      <td className="px-2 py-3 tabular-nums">{money(p.selling_price)}</td>
                      <td className="px-2 py-3">
                        <Select
                          className="h-8 min-w-36"
                          value={p.pricing_method || "manual"}
                          onChange={(e) => updateProduct(p.product_id, { pricing_method: e.target.value as never })}
                        >
                          <option value="manual">Manual price</option>
                          <option value="reference_factor">Reference + factor</option>
                          <option value="cost_markup">Cost + markup</option>
                        </Select>
                      </td>
                      <td className="px-2 py-3">
                        {p.pricing_method === "reference_factor" ? (
                          <div className="flex gap-1">
                            <Select
                              className="h-8 max-w-40"
                              value={p.reference_product_id || ""}
                              onChange={(e) => updateProduct(p.product_id, { reference_product_id: e.target.value })}
                            >
                              <option value="">Reference…</option>
                              {references.filter((r) => r.product_id !== p.product_id).map((r) => (
                                <option key={r.product_id} value={r.product_id}>{r.name}</option>
                              ))}
                            </Select>
                            <Input
                              className="h-8 w-20"
                              type="number"
                              step="0.01"
                              value={p.price_factor ?? 1}
                              onChange={(e) => updateProduct(p.product_id, { price_factor: Number(e.target.value) })}
                              title="Price factor"
                            />
                          </div>
                        ) : p.pricing_method === "cost_markup" ? (
                          <Input
                            className="h-8 w-24"
                            type="number"
                            step="0.1"
                            value={p.price_factor ?? pricingSettings.default_markup_percent}
                            onChange={(e) => updateProduct(p.product_id, { price_factor: Number(e.target.value) })}
                          />
                        ) : <span className="text-xs text-ink-muted">—</span>}
                      </td>
                      <td className="px-2 py-3 font-medium tabular-nums">{money(suggested)}</td>
                      <td className="px-2 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => {
                          updateProduct(p.product_id, { selling_price: suggested, price_override: undefined });
                          toast.success(`${p.name} price updated.`);
                        }}>
                          Apply
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2"><Settings2 className="size-4" /><h2 className="font-medium">Quotation defaults</h2></div>
          <Field label="Default markup (%)">
            <Input type="number" min={0} value={pricingSettings.default_markup_percent} onChange={(e) => updatePricingSettings({ default_markup_percent: Number(e.target.value) })} />
          </Field>
          <Field label="Default waste (%)">
            <Input type="number" min={0} value={pricingSettings.default_waste_percent} onChange={(e) => updatePricingSettings({ default_waste_percent: Number(e.target.value) })} />
          </Field>
          <Field label="Overhead (%)">
            <Input type="number" min={0} value={pricingSettings.overhead_percent} onChange={(e) => updatePricingSettings({ overhead_percent: Number(e.target.value) })} />
          </Field>
          <Field label="Target profit margin (%)">
            <Input type="number" min={0} max={99} value={pricingSettings.default_profit_margin_percent} onChange={(e) => updatePricingSettings({ default_profit_margin_percent: Number(e.target.value) })} />
          </Field>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pricingSettings.require_quote_approval} onChange={(e) => updatePricingSettings({ require_quote_approval: e.target.checked })} />
            Require approval before an AI/recommended quote is sent
          </label>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <RateCard title="Labour rates" action="Add labour" onAdd={() => setLabourOpen(true)}>
          {businessLabourRates.map((r) => (
            <div key={r.labour_rate_id} className="flex items-center justify-between border-b border-line py-3 last:border-0">
              <div><p className="font-medium">{r.profession}</p><p className="text-xs text-ink-muted">{r.workers_default} worker(s) · per {r.rate_unit}</p></div>
              <div className="flex items-center gap-2"><span className="font-medium">{money(r.rate)}</span><MoreActions actions={[{ label: "Delete", icon: <Trash2 className="size-4" />, destructive: true, onSelect: () => deleteLabourRate(r.labour_rate_id) }]} /></div>
            </div>
          ))}
        </RateCard>
        <RateCard title="Transport rates" action="Add vehicle" onAdd={() => setTransportOpen(true)}>
          {businessTransportRates.map((r) => (
            <div key={r.transport_rate_id} className="flex items-center justify-between border-b border-line py-3 last:border-0">
              <div><p className="font-medium">{r.vehicle}</p><p className="text-xs text-ink-muted">{r.capacity_tonnes} tonne capacity · per km</p></div>
              <div className="flex items-center gap-2"><span className="font-medium">{money(r.rate_per_km)}/km</span><MoreActions actions={[{ label: "Delete", icon: <Trash2 className="size-4" />, destructive: true, onSelect: () => deleteTransportRate(r.transport_rate_id) }]} /></div>
            </div>
          ))}
        </RateCard>
      </div>

      <Card className="mt-4 p-5">
        <div className="mb-3 flex items-center gap-2"><History className="size-4" /><h2 className="font-medium">Price history</h2></div>
        {businessPriceHistory.length === 0 ? <p className="text-sm text-ink-muted">Price changes will appear here automatically.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-muted"><tr><th className="px-2 py-2">Product</th><th className="px-2 py-2">Old</th><th className="px-2 py-2">New</th><th className="px-2 py-2">Reason</th><th className="px-2 py-2">Date</th></tr></thead>
              <tbody>{businessPriceHistory.slice(0, 30).map((h) => {
                const p = businessProducts.find((x) => x.product_id === h.product_id);
                return <tr key={h.price_history_id} className="border-t border-line"><td className="px-2 py-2">{p?.name || h.product_id}</td><td className="px-2 py-2">{money(h.old_price)}</td><td className="px-2 py-2 font-medium">{money(h.new_price)}</td><td className="px-2 py-2 text-ink-muted">{h.reason}</td><td className="px-2 py-2 text-ink-muted">{new Date(h.created_at).toLocaleDateString()}</td></tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </Card>

      {labourOpen ? <RateForm title="Add labour rate" onCancel={() => setLabourOpen(false)} onSubmit={(f) => { addLabourRate(f); setLabourOpen(false); }} type="labour" /> : null}
      {transportOpen ? <RateForm title="Add transport rate" onCancel={() => setTransportOpen(false)} onSubmit={(f) => { addTransportRate(f); setTransportOpen(false); }} type="transport" /> : null}
    </>
  );
}

function RateCard({ title, action, onAdd, children }: { title: string; action: string; onAdd: () => void; children: ReactNode }) {
  return <Card className="p-5"><div className="mb-2 flex items-center justify-between"><h2 className="font-medium">{title}</h2><Button size="sm" variant="secondary" onClick={onAdd}><Plus className="size-3.5" />{action}</Button></div>{children || <p className="text-sm text-ink-muted py-4">No rates configured.</p>}</Card>;
}

function RateForm({ title, onCancel, onSubmit, type }: { title: string; onCancel: () => void; onSubmit: (f: any) => void; type: "labour" | "transport" }) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [unit, setUnit] = useState("hour");
  const [capacity, setCapacity] = useState("");
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
    <Card className="w-full max-w-md p-5">
      <h2 className="mb-4 font-medium">{title}</h2>
      <Field label={type === "labour" ? "Profession" : "Vehicle"}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "labour" ? "Welder" : "10T crane / truck"} /></Field>
      <Field label={type === "labour" ? "Rate (KSh)" : "Rate per km (KSh)"}><Input type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
      {type === "labour" ? <Field label="Rate basis"><Select value={unit} onChange={(e) => setUnit(e.target.value)}><option value="hour">Hour</option><option value="day">Day</option></Select></Field> : <Field label="Capacity (tonnes)"><Input type="number" min={0} step="0.1" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>}
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button onClick={() => {
        if (!name.trim() || !rate) return;
        if (type === "labour") onSubmit({ profession: name.trim(), rate: Number(rate), rate_unit: unit, workers_default: 1, active: true });
        else onSubmit({ vehicle: name.trim(), rate_per_km: Number(rate), capacity_tonnes: Number(capacity || 0), active: true });
      }}>Save</Button></div>
    </Card>
  </div>;
}
