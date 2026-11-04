import { useEffect, useMemo, useState } from "react";
import { Calculator, Package, ArrowDownToLine, ArrowUpRight, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/field";
import { money, uid } from "@/lib/format";
import type { Product, ProductCustomizerConfig, QuoteLineItem } from "@/lib/types";

function evaluateArithmetic(expression: string): number {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/]/g) ?? [];
  if (tokens.join("") !== expression.replace(/\s/g, "")) {
    throw new Error("Use numbers, +, -, *, / and parentheses only.");
  }
  let index = 0;
  function factor(): number {
    const token = tokens[index++];
    if (token === "+" || token === "-") {
      const n = factor();
      return token === "-" ? -n : n;
    }
    if (token === "(") {
      const n = expressionValue();
      if (tokens[index++] !== ")") throw new Error("Missing closing parenthesis.");
      return n;
    }
    const n = Number(token);
    if (!Number.isFinite(n)) throw new Error("Invalid formula.");
    return n;
  }
  function term(): number {
    let n = factor();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const op = tokens[index++];
      const rhs = factor();
      if (op === "/" && rhs === 0) throw new Error("Cannot divide by zero.");
      n = op === "*" ? n * rhs : n / rhs;
    }
    return n;
  }
  function expressionValue(): number {
    let n = term();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const op = tokens[index++];
      const rhs = term();
      n = op === "+" ? n + rhs : n - rhs;
    }
    return n;
  }
  const result = expressionValue();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error("Invalid formula.");
  return result;
}

function evaluateFormulas(
  cells: Record<string, string | number | null>,
  config: ProductCustomizerConfig,
): { cells: Record<string, string | number | null>; total: number; error?: string } {
  const next = { ...cells };
  const columns = config.columns || [];
  const formulas = { ...(config.formulas || {}) };
  try {
    for (const col of columns) {
      if (col.type !== "formula") continue;
      let expr = (formulas[col.key] ?? col.formula ?? "0").trim().replace(/^=/, "");
      const keys = columns.map((c) => c.key).sort((a, b) => b.length - a.length);
      for (const key of keys) {
        const val = next[key];
        const num = typeof val === "number" ? val : Number(val ?? 0);
        expr = expr.replace(
          new RegExp(`\\b${key}\\b`, "gi"),
          String(Number.isFinite(num) ? num : 0),
        );
      }
      next[col.key] = evaluateArithmetic(expr);
    }
    const amountCol =
      columns.find((c) => c.key === "AMOUNT" && c.type === "formula") ||
      columns.filter((c) => c.type === "formula").at(-1);
    const total = amountCol ? Number(next[amountCol.key] ?? 0) : Number(config.total ?? 0);
    return { cells: next, total };
  } catch (e) {
    return {
      cells: next,
      total: Number(config.total ?? 0),
      error: e instanceof Error ? e.message : "Invalid formula",
    };
  }
}

const OpenCustomizerButton = ({ onClick }: { onClick?: () => void }) =>
  onClick ? (
    <Button type="button" size="sm" variant="outline" onClick={onClick} className="shrink-0">
      Open Product customizer <ArrowUpRight className="ml-1 size-3.5" />
    </Button>
  ) : null;

/** A customizer product from any business (own or another business's catalogue). */
type CustomizerProduct = Pick<
  Product,
  "product_id" | "business_id" | "name" | "category" | "unit" | "selling_price" | "customizer"
> & { sku?: string; business_name: string };

type Props = {
  /** Products of the business you are logged in as. */
  products: Product[];
  ownBusinessName?: string;
  onAdd: (item: QuoteLineItem) => void;
  /** Opens the product builder on the Products page so a new customizer product can be built. */
  onOpenCustomizer?: () => void;
};

const hasCustomizer = (p: { customizer?: ProductCustomizerConfig }) =>
  Boolean(p.customizer?.unlocked?.length || p.customizer?.columns?.length);

/**
 * Quote from a product-customizer catalogue item using different unlocked inputs.
 * Does not change the saved product — only builds a quotation line.
 * Products can come from your own catalogue or any other business's catalogue.
 */
export function CustomizerQuoteBuilder({ products, ownBusinessName, onAdd, onOpenCustomizer }: Props) {
  const [remote, setRemote] = useState<CustomizerProduct[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/quotation/customizer-products", {
          credentials: "include",
          cache: "no-store",
        });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setRemote(Array.isArray(json.products) ? json.products : []);
        }
      } catch {
        // Offline / not signed in: fall back to your own products only.
      } finally {
        if (!cancelled) setLoadingRemote(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const customizerProducts = useMemo<CustomizerProduct[]>(() => {
    const own = products.filter(hasCustomizer).map((p) => ({
      product_id: p.product_id,
      business_id: p.business_id,
      business_name: ownBusinessName || "My business",
      name: p.name,
      category: p.category,
      sku: p.sku,
      unit: p.unit,
      selling_price: p.selling_price,
      customizer: p.customizer,
    }));
    const ownIds = new Set(own.map((p) => p.product_id));
    return [...own, ...remote.filter((p) => hasCustomizer(p) && !ownIds.has(p.product_id))];
  }, [products, remote, ownBusinessName]);

  const ownBusinessId = products[0]?.business_id || "";
  const businesses = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const p of customizerProducts) {
      const cur = map.get(p.business_id);
      if (cur) cur.count++;
      else map.set(p.business_id, { id: p.business_id, name: p.business_name || "Business", count: 1 });
    }
    return Array.from(map.values()).sort(
      (a, b) => Number(b.id === ownBusinessId) - Number(a.id === ownBusinessId) || a.name.localeCompare(b.name),
    );
  }, [customizerProducts, ownBusinessId]);

  // null = not chosen yet: default to your own catalogue when it has customizer products, else all businesses.
  const [businessPick, setBusinessPick] = useState<string | null>(null);
  const businessId = businessPick ?? (businesses.some((b) => b.id === ownBusinessId) ? ownBusinessId : "");

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const selected = customizerProducts.find((p) => p.product_id === selectedId) || null;

  const [cells, setCells] = useState<Record<string, string | number | null>>({});
  const [qty, setQty] = useState("1");
  const [linesAdded, setLinesAdded] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customizerProducts.filter(
      (p) =>
        (!businessId || p.business_id === businessId) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          (p.category && p.category.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q))),
    );
  }, [customizerProducts, query, businessId]);

  function pickProduct(p: CustomizerProduct) {
    setSelectedId(p.product_id);
    setCells({ ...(p.customizer?.cells || {}) });
    setQty("1");
  }

  const config = selected?.customizer;
  const unlocked = config?.unlocked || [];

  const computed = useMemo(() => {
    if (!config) return { cells, total: 0, error: undefined as string | undefined };
    return evaluateFormulas(cells, config);
  }, [cells, config]);

  function updateField(key: string, value: string | number | null) {
    setCells((c) => ({ ...c, [key]: value }));
  }

  function addToQuote() {
    if (!selected || !config) return toast.error("Select a customizer product.");
    if (computed.error) return toast.error(computed.error);
    const q = Math.max(0, Number(qty) || 0);
    if (!q) return toast.error("Enter a quantity.");
    const unitRate = computed.total;
    const amount = unitRate * q;

    // Build a readable description of the variant inputs
    const parts: string[] = [];
    for (const u of unlocked) {
      const v = computed.cells[u.key];
      if (v === null || v === undefined || v === "") continue;
      parts.push(`${u.label}: ${v}${u.unit ? ` ${u.unit}` : ""}`);
    }
    const detail = parts.length ? ` (${parts.join(", ")})` : "";

    onAdd({
      line_id: uid("LI"),
      description: `${selected.name}${detail}`,
      qty: q,
      unit: selected.unit || "item",
      rate: unitRate,
      amount,
      customized: true,
      source_product_id: selected.product_id,
      source_business_id: selected.business_id,
      source_business_name: selected.business_name,
      meta: {
        calculator: "customizer-quote",
        product_id: selected.product_id,
        cells: computed.cells as Record<string, string | number | null>,
        unit_cost: unitRate,
      },
    });
    setLinesAdded((n) => n + 1);
    toast.success(`Added “${selected.name}” to quotation. Change inputs to reuse this product for another line.`);
  }

  function resetInputsFromProduct() {
    if (!selected?.customizer) return;
    setCells({ ...(selected.customizer.cells || {}) });
    setQty("1");
    toast.message("Inputs reset to catalogue defaults.");
  }

  if (!customizerProducts.length) {
    return (
      <Card className="mb-4 space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-leaf/50 p-2">
            <Calculator className="size-5" />
          </div>
          <div>
            <p className="font-semibold">Quote from customizer product</p>
            <p className="text-xs text-ink-muted">
              {loadingRemote
                ? "Loading customizer products from all businesses…"
                : "No customizer products yet. Build one under Products → Add product → Spreadsheet product builder, then return here to quote with different inputs."}
            </p>
          </div>
        </div>
        {!loadingRemote ? <OpenCustomizerButton onClick={onOpenCustomizer} /> : null}
      </Card>
    );
  }

  return (
    <Card className="mb-4 space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="rounded-lg bg-leaf/50 p-2">
            <Calculator className="size-5" />
          </div>
          <div>
            <p className="font-semibold">Quote from customizer product</p>
            <p className="text-xs text-ink-muted">
              Pick a catalogue product built with the spreadsheet customizer, change unlocked inputs
              (sizes, qty factors, rates), and add the recalculated line to this quotation. The saved
              product is not modified.
            </p>
          </div>
        </div>
        <OpenCustomizerButton onClick={onOpenCustomizer} />
      </div>

      <Field label="Catalogue" hint="whose customized products to use">
        <Select
          value={businessId}
          onChange={(e) => {
            setBusinessPick(e.target.value);
            setSelectedId("");
          }}
        >
          <option value="">All businesses ({customizerProducts.length})</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {b.id === ownBusinessId ? " (my business)" : ""} · {b.count}
            </option>
          ))}
        </Select>
        {loadingRemote ? <span className="mt-1 block text-xs text-ink-muted">Loading other businesses…</span> : null}
      </Field>

      <Field label="Search customizer products">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <Input
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, category, SKU…"
          />
        </div>
      </Field>

      <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-ink/10">
        {filtered.map((p) => (
          <button
            key={p.product_id}
            type="button"
            onClick={() => pickProduct(p)}
            className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-leaf/40 ${
              selectedId === p.product_id ? "bg-leaf/50" : ""
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block text-xs text-ink-muted">
                {p.category || "General"}
                {p.sku ? ` · ${p.sku}` : ""}
                {!businessId ? ` · ${p.business_name}` : ""}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-ink-muted">{money(p.selling_price)}</span>
          </button>
        ))}
        {!filtered.length ? (
          <p className="px-3 py-4 text-center text-xs text-ink-muted">No matching products.</p>
        ) : null}
      </div>

      {selected && config ? (
        <>
          <Card className="space-y-3 border-forest/20 bg-leaf/20 p-4 shadow-none">
            <div className="flex items-start gap-2">
              <Package className="mt-0.5 size-4 shrink-0 text-forest" />
              <div>
                <p className="text-sm font-semibold">{selected.name}</p>
                <p className="text-xs text-ink-muted">
                  Edit unlocked fields for this quote only. Locked sizes stay fixed.
                </p>
              </div>
            </div>

            {unlocked.length === 0 ? (
              <p className="text-xs text-ink-muted">
                This product has no unlocked fields — using saved costing.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {unlocked.map((u) => {
                  const isNumeric = u.type === "number" || u.type === "size";
                  const value = cells[u.key];
                  return (
                    <div key={u.key} className="rounded-md border border-ink/10 bg-paper px-3 py-2">
                      <label className="mb-1 block text-xs text-ink-muted">
                        {u.label}
                        {u.unit ? ` (${u.unit})` : ""}
                      </label>
                      <Input
                        className="h-9"
                        type={isNumeric ? "number" : "text"}
                        min={isNumeric ? 0 : undefined}
                        step={u.type === "size" ? "any" : undefined}
                        value={value === null || value === undefined ? "" : String(value)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (isNumeric) {
                            updateField(u.key, raw === "" ? 0 : Number(raw));
                          } else {
                            updateField(u.key, raw);
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Quote quantity" className="mb-0">
                <Input
                  type="number"
                  min={0}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </Field>
              <div className="flex flex-col justify-end">
                <p className="text-xs text-ink-muted">Unit cost (from formulas)</p>
                <p className="text-lg font-semibold tabular-nums">{money(computed.total)}</p>
              </div>
            </div>
            {computed.error ? <p className="text-xs text-red-600">{computed.error}</p> : null}
            <div className="flex items-center justify-between border-t border-ink/10 pt-2 text-sm">
              <span className="text-ink-muted">Line total</span>
              <span className="font-semibold tabular-nums">
                {money(computed.total * (Number(qty) || 0))}
              </span>
            </div>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-w-[180px] flex-1"
              onClick={addToQuote}
              disabled={!!computed.error}
            >
              <ArrowDownToLine className="mr-2 size-4" />
              {linesAdded > 0 ? "Add another line (reuse)" : "Add to quotation"}
            </Button>
            <Button type="button" variant="outline" onClick={resetInputsFromProduct}>
              Reset inputs
            </Button>
          </div>
          {linesAdded > 0 ? (
            <p className="text-xs text-forest">
              {linesAdded} line{linesAdded === 1 ? "" : "s"} added from customizer products. Adjust
              unlocked fields or pick another product to reuse in this quote.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-ink-muted">Select a product above to set inputs and price.</p>
      )}
    </Card>
  );
}
