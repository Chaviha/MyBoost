import { useEffect, useMemo, useState } from "react";
import { Calculator, Package, ArrowDownToLine, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/field";
import { money, uid } from "@/lib/format";
import { evaluateFormula as evaluateArithmetic } from "@/lib/formula-eval";
import type { Product, ProductCustomizerConfig, QuoteLineItem } from "@/lib/types";
import type { SubColumnDef, SubProduct } from "@/lib/sub-products";
import { lookupRatesFromProductDetailed } from "@/components/advanced-quotation-calculator";
import { applyCatalogueValues, resolveCatalogueLinks } from "@/lib/catalogue-sync";
import { SubProductPicker } from "@/components/sub-product-editor";
import { applySubProductRates, subProductSelectionCells } from "@/lib/sub-products";
import {
  applyRateTableRow,
  listProductRateOptions,
  rateTableSelectOptions,
  resolveEffectiveRateConfig,
  resolveRateTableSourceProduct,
} from "@/lib/rate-table-select";

/* evaluateArithmetic imported from @/lib/formula-eval */

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

type Props = {
  products: Product[];
  onAdd: (item: QuoteLineItem) => void;
};

/**
 * Quote from a product-customizer catalogue item using different unlocked inputs.
 * Does not change the saved product — only builds a quotation line.
 */
export function CustomizerQuoteBuilder({ products: ownProducts, onAdd }: Props) {
  // Customized products other businesses chose to share, plus the prices they depend on.
  const [shared, setShared] = useState<{ products: Product[]; dependencies: Product[] }>({
    products: [],
    dependencies: [],
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/quotation/customizer-products", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { products?: unknown[]; dependencies?: unknown[] };
        if (cancelled) return;
        setShared({
          products: (Array.isArray(data.products) ? data.products : []) as Product[],
          dependencies: (Array.isArray(data.dependencies) ? data.dependencies : []) as Product[],
        });
      } catch {
        /* offline / not signed in: own products only */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const ownIds = useMemo(() => new Set(ownProducts.map((p) => p.product_id)), [ownProducts]);
  const foreign = useMemo(
    () => shared.products.filter((p) => !ownIds.has(p.product_id)),
    [shared.products, ownIds],
  );
  /** Own products plus shared ones' dependencies, for live price / rate-table lookups. */
  const products = useMemo(
    () => [...ownProducts, ...shared.dependencies.filter((d) => !ownIds.has(d.product_id))],
    [ownProducts, shared.dependencies, ownIds],
  );
  const businessOf = useMemo(
    () => new Map(foreign.map((p) => [p.product_id, (p as unknown as { business_name?: string }).business_name || ""])),
    [foreign],
  );
  const customizerProducts = useMemo(
    () => [...ownProducts, ...foreign].filter((p) => {
      if (!ownIds.has(p.product_id)) return true; // shared products always carry a customizer
        if (p.customizer?.columns?.length) return true;
        if (p.customizer?.unlocked?.length) return true;
        if (p.customizer?.calculator === "advanced-spreadsheet") return true;
        // Products saved from the spreadsheet builder
        if ((p.description || "").toLowerCase().includes("spreadsheet product builder")) return true;
        if ((p.description || "").toLowerCase().includes("product customizer")) return true;
        return false;
    }),
    [ownProducts, foreign, ownIds],
  );

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const selected = customizerProducts.find((p) => p.product_id === selectedId) || null;

  const [cells, setCells] = useState<Record<string, string | number | null>>({});
  const [qty, setQty] = useState("1");
  const [linesAdded, setLinesAdded] = useState(0);

  const [categoryFilter, setCategoryFilter] = useState("");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of customizerProducts) {
      if (p.category) set.add(p.category);
    }
    return [...set].sort();
  }, [customizerProducts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customizerProducts.filter((p) => {
      if (categoryFilter && (p.category || "") !== categoryFilter) return false;
      if (!q) return true;
      const hay = [
        p.name,
        p.category,
        p.sku,
        p.description,
        p.family,
        p.unit,
        ...(p.customizer?.columns || []).map((c) => c.label),
        ...(p.customizer?.unlocked || []).map((u) => u.label),
        businessOf.get(p.product_id),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [customizerProducts, query, categoryFilter, businessOf]);

  function pickProduct(p: Product) {
    setSelectedId(p.product_id);
    const nextCells = { ...(p.customizer?.cells || {}) };
    // Live sync: if linked to a catalogue product, use its current selling_price as RATE
    const catId = p.customizer?.catalogueProductId || p.reference_product_id;
    if (catId) {
      const src = products.find((x) => x.product_id === catId);
      if (src && typeof src.selling_price === "number") {
        const rateKey = p.customizer?.catalogueRateKey || "RATE";
        nextCells[rateKey] = src.selling_price;
      }
    }
    // Catalogue columns carry the linked product's synced price, not its id
    setCells(
      applySubProductRates(
        applyCatalogueValues(nextCells, resolveCatalogueLinks(p.customizer, products), products, p.customizer?.catalogueVariants),
        p.customizer?.columns,
        products,
        p.customizer?.catalogueRateKey || "RATE",
      ),
    );
    setQty("1");
  }

  const config = selected?.customizer;
  const effectiveConfig = useMemo(
    () => resolveEffectiveRateConfig(config, products, { preferSource: true }),
    [config, products],
  );
  const rateSourceProduct = useMemo(
    () => resolveRateTableSourceProduct(config, products),
    [config, products],
  );
  const rateSelect = useMemo(
    () => rateTableSelectOptions(effectiveConfig),
    [effectiveConfig],
  );

  // Quoters only: never include sizeLocked columns even if mis-listed in unlocked
  const unlocked = useMemo(() => {
    const base = (config?.unlocked || [])
      .filter((u) => {
        const col = config?.columns?.find((c) => c.key === u.key);
        const colType = col?.type === "size" ? "dropdown" : col?.type;
        if (colType === "dropdown" && col?.sizeLocked) return false;
        if (col && col.editableByQuoter === false) return false;
        return true;
      })
      .map((u) => {
        const col = config?.columns?.find((c) => c.key === u.key);
        const type = u.type === "size" ? "dropdown" : u.type;
        return {
          ...u,
          type,
          options: (u.options ?? col?.options)?.map(String) || [],
          lookupProductId: (u as { lookupProductId?: string }).lookupProductId ?? col?.lookupProductId,
          lookupMatchKey: (u as { lookupMatchKey?: string }).lookupMatchKey ?? col?.lookupMatchKey,
          lookupFillKeys: (u as { lookupFillKeys?: string[] }).lookupFillKeys ?? col?.lookupFillKeys,
          subProducts: (u as { subProducts?: SubProduct[] }).subProducts ?? col?.subProducts,
          subColumns: (u as { subColumns?: SubColumnDef[] }).subColumns ?? col?.subColumns,
          rateTableDriven: false as boolean,
        };
      });

    // Auto first-column dropdown from spreadsheet builder rate-table rows
    if (rateSelect.key && rateSelect.options.length) {
      const optValues = rateSelect.options.map((o) => o.value);
      const idx = base.findIndex((f) => f.key === rateSelect.key);
      if (idx >= 0) {
        const existing = base[idx];
        base[idx] = {
          ...existing,
          type: "dropdown",
          options: optValues,
          rateTableDriven: true,
          label: existing.label || rateSelect.key,
        };
        if (idx > 0) {
          const [item] = base.splice(idx, 1);
          base.unshift(item);
        }
      } else {
        const col = config?.columns?.find((c) => c.key === rateSelect.key);
        base.unshift({
          key: rateSelect.key,
          label: col?.label || rateSelect.key,
          type: "dropdown",
          unit: col?.unit,
          options: optValues,
          rateTableDriven: true,
        } as (typeof base)[number]);
      }
    }
    return base;
  }, [config, rateSelect]);

  const computed = useMemo(() => {
    if (!config) return { cells, total: 0, error: undefined as string | undefined };
    return evaluateFormulas(cells, config);
  }, [cells, config]);

  function updateField(key: string, value: string | number | null) {
    setCells((c) => {
      let next: Record<string, string | number | null> = { ...c, [key]: value };
      const field = unlocked.find((u) => u.key === key);
      const col = config?.columns?.find((x) => x.key === key);

      // Spreadsheet builder row selected → fill associated cells from that rate-table row
      if (field?.rateTableDriven && value) {
        if (rateSelect.missingRateTable || !rateSelect.options.length) {
          toast.error(
            "No rate table on this product. Open Spreadsheet product builder, add at least one row, and save.",
          );
        } else {
          const raw = String(value);
          const match =
            rateSelect.options.find((o) => o.value === raw) ||
            rateSelect.options.find((o) => String(o.row[key] ?? "").trim() === raw) ||
            rateSelect.options.find((o) => o.label === raw);
          if (match) {
            next = applyRateTableRow(next, match.row, config);
            if (rateSelect.key) {
              const identity = match.row[rateSelect.key];
              next[rateSelect.key] =
                identity !== undefined && identity !== null && String(identity).trim() !== ""
                  ? identity
                  : match.label;
            }
          } else {
            toast.error(
              `No rate-table row matches “${raw}”. Add that row in the Spreadsheet product builder and save.`,
            );
          }
        }
      }

      if (field?.type === "subproduct" || col?.type === "subproduct") {
        const unitKey = config?.columns?.find((x) => x.key.toUpperCase() === "UNIT")?.key;
        Object.assign(
          next,
          subProductSelectionCells(
            {
              key,
              type: "subproduct",
              subProducts: field?.subProducts ?? col?.subProducts,
              subColumns: field?.subColumns ?? col?.subColumns,
            },
            String(value ?? ""),
            products,
            config?.catalogueRateKey || "RATE",
            unitKey,
            config?.columns?.map((x) => x.key),
          ),
        );
      }
      const lookupProductId = field?.lookupProductId ?? col?.lookupProductId;
      if ((field?.type === "dropdown" || col?.type === "dropdown") && lookupProductId && value && !field?.rateTableDriven) {
        const source = products.find((p) => p.product_id === lookupProductId);
        const fillKeys =
          field?.lookupFillKeys?.length || col?.lookupFillKeys?.length
            ? field?.lookupFillKeys || col?.lookupFillKeys || []
            : ["RATE", "DENSITY"];
        const matchKey = field?.lookupMatchKey || col?.lookupMatchKey || key;
        const lookup = lookupRatesFromProductDetailed(
          source,
          String(value),
          matchKey,
          fillKeys,
        );
        if (lookup.error) {
          toast.error(lookup.error);
        }
        for (const [srcKey, srcVal] of Object.entries(lookup.values)) {
          const target =
            config?.columns?.find((x) => x.key.toUpperCase() === srcKey.toUpperCase())?.key ||
            unlocked.find((x) => x.key.toUpperCase() === srcKey.toUpperCase())?.key ||
            srcKey;
          next[target] = srcVal;
        }
      }
      return next;
    });
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
      <Card className="mb-4 space-y-2 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-leaf/50 p-2">
            <Calculator className="size-5" />
          </div>
          <div>
            <p className="font-semibold">Quote from customizer product</p>
            <p className="text-xs text-ink-muted">
              No products built with the Product customizer yet. Create one under Products → Spreadsheet
              product builder (or the Product customizer quote type), then return here to quote with
              different inputs.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-4 space-y-4 p-4">
      <div className="flex items-start gap-3">
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

      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <Field label="Catalogue search" hint="Products built with the product customizer">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <Input
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, category, SKU, description…"
            />
          </div>
        </Field>
        <Field label="Category">
          <select
            className="flex h-10 w-full rounded-md border border-ink/15 bg-paper px-3 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <p className="text-xs text-ink-muted">
        {filtered.length} customizer product{filtered.length === 1 ? "" : "s"}
        {query || categoryFilter ? " match" : " in catalogue"}
      </p>

      <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-ink/10">
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
                {" · "}
                <span className="text-forest">Customizer</span>
                {businessOf.get(p.product_id) ? ` · from ${businessOf.get(p.product_id)}` : ""}
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
                  Edit unlocked fields for this quote only. Locked sizes stay fixed. Choose a
                  spreadsheet row from the first dropdown to load its rates and sizes.
                </p>
              </div>
            </div>

            {rateSelect.missingRateTable ? (
              <div
                role="alert"
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                <p className="font-medium">Rate table missing</p>
                <p className="mt-0.5 text-xs text-amber-800">
                  This product has no spreadsheet rate-table rows. Open Spreadsheet product builder,
                  add at least one row, and save — then the variant dropdown will appear here.
                </p>
              </div>
            ) : null}

            {unlocked.length === 0 ? (
              <p className="text-xs text-ink-muted">
                This product has no unlocked fields — using saved costing.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {unlocked.map((u) => {
                  const isDropdown = u.type === "dropdown" || u.type === "size";
                  const dropdownOptions = (u.options || []).map(String);
                  const isNumeric = u.type === "number";
                  const value = cells[u.key];
                  return (
                    <div key={u.key} className="rounded-md border border-ink/10 bg-paper px-3 py-2">
                      <label className="mb-1 block text-xs text-ink-muted">
                        {u.label}
                        {u.unit ? ` (${u.unit})` : ""}
                        {u.rateTableDriven ? (
                          <span className="ml-1 text-[10px] text-forest">
                            {rateSourceProduct
                              ? ` · same table as ${rateSourceProduct.name}`
                              : " · rows from spreadsheet builder"}
                          </span>
                        ) : null}
                      </label>
                      {u.type === "subproduct" ? (
                        <SubProductPicker
                          tree={u.subProducts}
                          value={String(value ?? "")}
                          onChange={(label) => updateField(u.key, label)}
                        />
                      ) : u.type === "catalogue" ? (
                        <div className="flex h-9 items-center justify-between rounded-md border border-ink/10 bg-leaf/30 px-3 text-sm">
                          <span className="truncate text-ink-muted">
                            {products.find(
                              (x) =>
                                x.product_id ===
                                resolveCatalogueLinks(config, products)[u.key],
                            )?.name || "Catalogue item"}
                          </span>
                          <span className="font-medium tabular-nums">{money(Number(value ?? 0))}</span>
                        </div>
                      ) : isDropdown ? (
                        <Select
                          className="h-9"
                          value={
                            (() => {
                              if (value === null || value === undefined || value === "") return "";
                              const raw = String(value);
                              if (!u.rateTableDriven) return raw;
                              const byValue = rateSelect.options.find((o) => o.value === raw);
                              if (byValue) return byValue.value;
                              const byCell = rateSelect.options.find(
                                (o) => String(o.row[u.key] ?? "").trim() === raw,
                              );
                              if (byCell) return byCell.value;
                              return raw;
                            })()
                          }
                          onChange={(e) => updateField(u.key, e.target.value)}
                        >
                          <option value="">Select…</option>
                          {u.rateTableDriven
                            ? rateSelect.options.length
                              ? rateSelect.options.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))
                              : (
                                  <option value="" disabled>
                                    No rate-table rows — add rows in Spreadsheet product builder
                                  </option>
                                )
                            : (() => {
                                const src = u.lookupProductId
                                  ? products.find((p) => p.product_id === u.lookupProductId)
                                  : undefined;
                                const linkedOpts = listProductRateOptions(src);
                                if (linkedOpts.length) {
                                  return linkedOpts.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                      {opt.rate !== undefined ? ` · ${opt.rate}` : ""}
                                    </option>
                                  ));
                                }
                                return dropdownOptions.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                    {u.unit ? ` ${u.unit}` : ""}
                                  </option>
                                ));
                              })()}
                        </Select>
                      ) : (
                        <Input
                          className="h-9"
                          type={isNumeric ? "number" : "text"}
                          min={isNumeric ? 0 : undefined}
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
                      )}
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
