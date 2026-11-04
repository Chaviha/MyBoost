import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { MarketplaceProduct, ProductQuoteColumn, QuoteLineItem } from "@/lib/types";
import { money, uid } from "@/lib/format";

type ConfiguredProduct = MarketplaceProduct & { quotation_config?: { enabled: boolean; columns: ProductQuoteColumn[]; allowQuantityEdit: boolean; instructions?: string } };
type Props = { products: MarketplaceProduct[]; onAdd: (item: QuoteLineItem) => void };

// Small arithmetic-only evaluator. No eval/Function and no arbitrary JavaScript.
function calculate(formula: string, values: Record<string, unknown>): number {
  let source = formula.startsWith("=") ? formula.slice(1) : formula;
  for (const [key, value] of Object.entries(values)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    source = source.replace(new RegExp(`\\b${escaped}\\b`, "g"), String(Number(value ?? 0) || 0));
  }
  if (!/^[\d+\-*/().\s]+$/.test(source)) throw new Error("Unsupported formula. Use numeric column IDs and + - * / ( ).");
  const tokens = source.match(/\d+(?:\.\d+)?|[()+\-*/]/g) ?? [];
  if (tokens.join("") !== source.replace(/\s/g, "")) throw new Error("Invalid formula syntax.");
  let i = 0;
  const factor = (): number => {
    const token = tokens[i++];
    if (token === "+" || token === "-") { const n = factor(); return token === "-" ? -n : n; }
    if (token === "(") { const n = sum(); if (tokens[i++] !== ")") throw new Error("Missing closing parenthesis."); return n; }
    const n = Number(token); if (!Number.isFinite(n)) throw new Error("Invalid numeric value."); return n;
  };
  const term = (): number => { let n = factor(); while (tokens[i] === "*" || tokens[i] === "/") { const op = tokens[i++]; const rhs = factor(); if (op === "/" && rhs === 0) throw new Error("Division by zero."); n = op === "*" ? n * rhs : n / rhs; } return n; };
  const sum = (): number => { let n = term(); while (tokens[i] === "+" || tokens[i] === "-") { const op = tokens[i++]; const rhs = term(); n = op === "+" ? n + rhs : n - rhs; } return n; };
  const result = sum(); if (i !== tokens.length || !Number.isFinite(result)) throw new Error("Invalid formula."); return result;
}

export function ConfigurableProductQuote({ products, onAdd }: Props) {
  const configurable = products.filter((p) => (p as ConfiguredProduct).quotation_config?.enabled) as ConfiguredProduct[];
  const [productId, setProductId] = useState("");
  const product = configurable.find((p) => p.product_id === productId);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [quantity, setQuantity] = useState("1");
  const [cataloguePrices, setCataloguePrices] = useState<Record<string, number>>({});
  const calculated = useMemo(() => {
    const result = { ...values, ...cataloguePrices };
    if (!product?.quotation_config) return result;
    // Repeat passes so a formula may refer to another formula column.
    for (let pass = 0; pass < product.quotation_config.columns.length; pass++) {
      for (const column of product.quotation_config.columns) {
        if (column.type === "formula" && column.formula) {
          try { result[column.id] = calculate(column.formula, result); }
          catch { result[column.id] = "Formula error"; }
        }
      }
    }
    return result;
  }, [product, values, cataloguePrices]);

  function addToQuote() {
    if (!product?.quotation_config) return;
    const qty = product.quotation_config.allowQuantityEdit ? Math.max(1, Number(quantity) || 1) : 1;
    const formulas = product.quotation_config.columns.filter((c) => c.type === "formula");
    if (formulas.some((c) => typeof calculated[c.id] !== "number")) return toast.error("Correct the formula inputs before adding this product.");
    const catalogueCost = Object.values(cataloguePrices).reduce((sum, value) => sum + value, 0);
    const formulaCost = formulas.reduce((sum, c) => sum + Number(calculated[c.id] || 0), 0);
    // Formula fields are treated as computed cost contributions; catalogue selections add their current catalogue price.
    const unitRate = Number(product.selling_price || 0) + catalogueCost + formulaCost;
    const amount = qty * unitRate;
    const detail = product.quotation_config.columns.map((c) => `${c.label}: ${String(calculated[c.id] ?? values[c.id] ?? "")}${c.unit ? ` ${c.unit}` : ""}`).join(" | ");
    const meta: Record<string, string | number | boolean | null> = { configuration: detail };
    product.quotation_config.columns.forEach((c) => { meta[c.id] = String(calculated[c.id] ?? values[c.id] ?? ""); });
    onAdd({ line_id: uid("QLI"), description: product.name, qty, unit: product.unit || "unit", rate: unitRate, amount, source_product_id: product.product_id, source_business_id: product.business_id, source_business_name: product.business_name, customized: true, meta });
    toast.success("Configured product added to quotation.");
  }

  return <section className="my-4 rounded-xl border border-ink/10 p-3">
    <div className="mb-3"><h3 className="font-semibold">Custom product calculator</h3><p className="text-xs text-ink-muted">The product creator controls which columns and sizes you can edit.</p></div>
    <Select value={productId} onChange={(e) => { setProductId(e.target.value); setValues({}); setCataloguePrices({}); setQuantity("1"); }}>
      <option value="">Select configurable product…</option>
      {configurable.map((p) => <option key={p.product_id} value={p.product_id}>{p.name} · {p.business_name}</option>)}
    </Select>
    {product?.quotation_config ? <>
      {product.quotation_config.instructions ? <p className="my-3 text-sm">{product.quotation_config.instructions}</p> : null}
      <div className="mt-3 overflow-x-auto rounded-lg border"><table className="w-full min-w-[580px] text-sm"><thead><tr className="bg-muted text-left"><th className="border p-2">Column</th><th className="border p-2">Value</th><th className="border p-2">Unit</th></tr></thead><tbody>
        {product.quotation_config.columns.map((column) => <tr key={column.id}><td className="border p-2">{column.label}</td><td className="border p-2">
          {column.type === "formula" ? <strong>{String(calculated[column.id] ?? "—")}</strong>
          : column.type === "catalogue" ? <Select value={String(values[column.id] ?? "")} onChange={(e) => { const selected = products.find((p) => p.product_id === e.target.value); setValues((old) => ({ ...old, [column.id]: e.target.value })); setCataloguePrices((old) => ({ ...old, [column.id]: Number(selected?.selling_price || 0) })); }}><option value="">Select catalogue item…</option>{products.filter((p) => !column.catalogueCategory || p.category === column.catalogueCategory).map((p) => <option key={p.product_id} value={p.product_id}>{p.name} · {money(p.selling_price)}</option>)}</Select>
          : column.editable === false ? <span>{String(values[column.id] ?? "")}</span>
          : <Input type={column.type === "number" ? "number" : "text"} step="any" value={String(values[column.id] ?? "")} onChange={(e) => setValues((old) => ({ ...old, [column.id]: column.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value }))} />}
        </td><td className="border p-2 text-xs text-ink-muted">{column.unit || column.type}</td></tr>)}
      </tbody></table></div>
      {product.quotation_config.allowQuantityEdit ? <div className="mt-3 max-w-40"><label className="mb-1 block text-xs">Quantity</label><Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div> : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-sm">Calculated unit cost: <strong>{money(Number(product.selling_price || 0) + Object.values(cataloguePrices).reduce((a,b) => a+b,0) + product.quotation_config.columns.filter((c) => c.type === "formula").reduce((a,c) => a + (typeof calculated[c.id] === "number" ? Number(calculated[c.id]) : 0),0))}</strong></p><Button type="button" onClick={addToQuote}>Add to quotation</Button></div>
    </> : null}
    {!configurable.length ? <p className="mt-3 text-sm text-ink-muted">No configurable products are available. The product creator must enable the custom quotation calculator in the product form.</p> : null}
  </section>;
}
