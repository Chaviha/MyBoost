import { useEffect, useMemo, useState } from "react";
import { Package, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { money } from "@/lib/format";
import { evaluateFormula as evaluateArithmetic } from "@/lib/formula-eval";
import type { Product, ProductCustomizerConfig, SpecValues } from "@/lib/types";
import { lookupRatesFromProductDetailed } from "@/components/advanced-quotation-calculator";
import {
  listProductRateOptions,
  resolveCatalogueRate,
  resolveEffectiveRateConfig,
  resolveRateTableSourceProduct,
} from "@/lib/rate-table-select";
import { useLife } from "@/lib/store";
import { applyCatalogueValues, resolveCatalogueLinks } from "@/lib/catalogue-sync";
import { SubProductPicker } from "@/components/sub-product-editor";
import { applySubProductRates, subProductSelectionCells } from "@/lib/sub-products";

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
        expr = expr.replace(new RegExp(`\\b${key}\\b`, "gi"), String(Number.isFinite(num) ? num : 0));
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


/** Prefer a stable identity column for rate-table row selection. */
function pickRowSelectKey(config: ProductCustomizerConfig | undefined): string | null {
  const columns = config?.columns || [];
  const preferred = ["DESCRIPTION", "MATERIAL", "OPTION", "TYPE", "SIZE", "NAME"];
  for (const key of preferred) {
    const col = columns.find((c) => c.key.toUpperCase() === key && c.type !== "formula");
    if (col) return col.key;
  }
  const first = columns.find((c) => c.type !== "formula");
  return first?.key || null;
}

/**
 * Build dropdown options from spreadsheet builder rate-table rows.
 * Each row added in the builder becomes one option; selecting it restores that row's cells.
 */
function rateTableSelectOptions(config: ProductCustomizerConfig | undefined): {
  key: string | null;
  options: Array<{ value: string; label: string; row: Record<string, string | number | null>; index: number }>;
  /** True when this product is spreadsheet-built but has no rate table rows. */
  missingRateTable: boolean;
} {
  const table = Array.isArray(config?.rateTable) ? config!.rateTable! : [];
  const key = pickRowSelectKey(config);
  const isSpreadsheet = config?.calculator === "advanced-spreadsheet" || Boolean(config?.columns?.length);
  if (!key || !table.length) {
    return {
      key: key,
      options: [],
      missingRateTable: isSpreadsheet && !table.length,
    };
  }

  const options = table.map((row, index) => {
    const raw = String(row[key] ?? "").trim();
    const fallback =
      String(row.DESCRIPTION ?? row.MATERIAL ?? row.OPTION ?? row.TYPE ?? "").trim() ||
      `Row ${index + 1}`;
    const title = raw || fallback;
    const amountVal = row["AMOUNT"] ?? row["Amount"];
    const suffix =
      amountVal !== undefined && amountVal !== null && amountVal !== ""
        ? ` — ${amountVal}`
        : "";
    return {
      value: `__row_${index}`,
      label: `${title}${suffix}`,
      row,
      index,
    };
  });
  return { key, options, missingRateTable: false };
}

/** Apply a rate-table row onto current cells (non-formula keys only; formulas recompute). */
function applyRateTableRow(
  current: Record<string, string | number | null>,
  row: Record<string, string | number | null>,
  config: ProductCustomizerConfig | undefined,
): Record<string, string | number | null> {
  const next = { ...current };
  const formulaKeys = new Set(
    (config?.columns || []).filter((c) => c.type === "formula").map((c) => c.key),
  );
  for (const [k, v] of Object.entries(row)) {
    if (formulaKeys.has(k)) continue;
    next[k] = v;
  }
  return next;
}



/** Merge edited cells into the product rate table so spreadsheet editor stays in sync. */
function mergeCellsIntoRateTable(
  rateTable: Array<Record<string, string | number | null>> | undefined,
  cells: Record<string, string | number | null>,
  identityKey: string | null,
): Array<Record<string, string | number | null>> {
  const row = { ...cells };
  if (!rateTable?.length) return [row];

  const next = rateTable.map((r) => ({ ...r }));
  if (identityKey) {
    const want = String(cells[identityKey] ?? "").trim().toLowerCase();
    if (want) {
      const idx = next.findIndex(
        (r) => String(r[identityKey] ?? "").trim().toLowerCase() === want,
      );
      if (idx >= 0) {
        next[idx] = { ...next[idx], ...row };
        return next;
      }
    }
  }
  // Default: update primary row (what Edit in product customizer seeds first)
  next[0] = { ...next[0], ...row };
  return next;
}

type Props = {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true (product creator / catalogue owner), locked sizes are editable. Quoters: false. */
  creatorMode?: boolean;
  /** Optional list of customized products — powers the top product selector. */
  products?: Product[];
  /** Called when the user picks another product from the top dropdown. */
  onSelectProduct?: (productId: string) => void;
  onSave: (patch: {
    specs?: SpecValues;
    cost_price?: number;
    selling_price?: number;
    customizer?: ProductCustomizerConfig;
  }) => void;
};

/** Dialog card: edit customizer fields. Locked fields only when creatorMode. */
export function ProductCustomizerEditDialog({
  product,
  open,
  onOpenChange,
  onSave,
  creatorMode = false,
  products,
  onSelectProduct,
}: Props) {
  const config = product.customizer;
  const { state } = useLife();
  const [cells, setCells] = useState<Record<string, string | number | null>>(
    () => ({ ...(config?.cells || {}) }),
  );

  const selectableProducts = useMemo(() => {
    const list = (products && products.length ? products : [product]).filter(
      (p) => p.customizer?.columns?.length || p.customizer?.unlocked?.length,
    );
    // Ensure the current product is always in the list
    if (!list.some((p) => p.product_id === product.product_id)) {
      return [product, ...list];
    }
    return list;
  }, [products, product]);

  // Reset local state when opening; sync RATE from linked catalogue product’s live price
  useEffect(() => {
    if (open) {
      const next = { ...(config?.cells || {}) };
      const catId = config?.catalogueProductId || product.reference_product_id;
      if (catId) {
        const src = state.products.find((p) => p.product_id === catId);
        if (src && typeof src.selling_price === "number") {
          const rateKey = config?.catalogueRateKey || "RATE";
          next[rateKey] = src.selling_price;
        }
      }
      // Catalogue columns show the synced price of their linked product, not the link
      const withCatalogue = applyCatalogueValues(
        next,
        resolveCatalogueLinks(config, state.products),
        state.products,
        config?.catalogueVariants,
      );
      setCells(
        applySubProductRates(
          withCatalogue,
          config?.columns,
          state.products,
          config?.catalogueRateKey || "RATE",
        ),
      );
    }
  }, [open, product.product_id, config, product.reference_product_id, state.products]);

  const unlocked = config?.unlocked || [];
  const effectiveConfig = useMemo(
    () => resolveEffectiveRateConfig(config, state.products, { preferSource: true }),
    [config, state.products],
  );
  const rateSourceProduct = useMemo(
    () => resolveRateTableSourceProduct(config, state.products),
    [config, state.products],
  );
  const rateSelect = useMemo(
    () => rateTableSelectOptions(effectiveConfig),
    [effectiveConfig],
  );

  /** Only unlocked fields are shown: locked sizes and columns with Editable unchecked are hidden.
   *  When the product has a spreadsheet rate table, the first column is forced to a dropdown
   *  whose options are the builder rows — choosing one fills associated cells.
   */
  const editableFields = (() => {
    let fields: Array<{
      key: string;
      label: string;
      type: string;
      unit?: string;
      options: string[];
      lookupProductId?: string;
      lookupMatchKey?: string;
      lookupFillKeys?: string[];
      subProducts?: typeof unlocked[number]["subProducts"];
      subColumns?: typeof unlocked[number]["subColumns"];
      locked: boolean;
      /** When true, selecting an option applies the matching rate-table row to all cells. */
      rateTableDriven?: boolean;
    }>;

    if (config?.columns?.length) {
      fields = config.columns
        .filter((c) => {
          if (c.type === "formula") return false;
          const t = c.type === "size" ? "dropdown" : c.type;
          if (t === "dropdown" && c.sizeLocked) return false;
          if (c.editableByQuoter === false) return false;
          return true;
        })
        .map((c) => {
          const t = c.type === "size" ? "dropdown" : c.type;
          const lockedForQuoter =
            c.editableByQuoter === false || (t === "dropdown" && !!c.sizeLocked);
          return {
            key: c.key,
            label: c.label,
            type: t,
            unit: c.unit,
            options: (c.options || []).map(String),
            lookupProductId: c.lookupProductId,
            lookupMatchKey: c.lookupMatchKey,
            lookupFillKeys: c.lookupFillKeys,
            subProducts: c.subProducts,
            subColumns: c.subColumns,
            locked: lockedForQuoter,
            rateTableDriven: false,
          };
        });
    } else {
      fields = unlocked.map((u) => ({
        key: u.key,
        label: u.label,
        type: u.type === "size" ? "dropdown" : u.type,
        unit: u.unit,
        options: (u.options || []).map(String),
        lookupProductId: u.lookupProductId,
        lookupMatchKey: u.lookupMatchKey,
        lookupFillKeys: u.lookupFillKeys,
        subProducts: u.subProducts,
        subColumns: u.subColumns,
        locked: false,
        rateTableDriven: false,
      }));
    }

    // Auto first-column dropdown from spreadsheet builder rows
    if (rateSelect.key && rateSelect.options.length) {
      const optValues = rateSelect.options.map((o) => o.value);
      const idx = fields.findIndex((f) => f.key === rateSelect.key);
      if (idx >= 0) {
        const existing = fields[idx];
        fields[idx] = {
          ...existing,
          type: "dropdown",
          options: optValues,
          rateTableDriven: true,
          label: existing.label || rateSelect.key,
        };
        // Move rate-table column to the front so it is the first input
        if (idx > 0) {
          const [item] = fields.splice(idx, 1);
          fields.unshift(item);
        }
      } else {
        // First column not in unlocked list — still expose row selector at top
        const col = config?.columns?.find((c) => c.key === rateSelect.key);
        fields.unshift({
          key: rateSelect.key,
          label: col?.label || rateSelect.key,
          type: "dropdown",
          unit: col?.unit,
          options: optValues,
          locked: false,
          rateTableDriven: true,
        });
      }
    }

    return fields;
  })();

  const quoterEditableFields = editableFields;
  const computed = useMemo(() => {
    if (!config) return { cells, total: product.selling_price, error: undefined as string | undefined };
    return evaluateFormulas(cells, config);
  }, [cells, config, product.selling_price]);

  if (!config) return null;

  function updateField(key: string, value: string | number | null) {
    setCells((c) => {
      let next: Record<string, string | number | null> = { ...c, [key]: value };
      const field = editableFields.find((u) => u.key === key);

      // Spreadsheet builder row selected → fill all associated cells from that rate-table row
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
            // Persist the real identity value from the rate-table row (not the __row_N sentinel)
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

      if (field?.type === "subproduct") {
        const unitKey = config?.columns?.find((x) => x.key.toUpperCase() === "UNIT")?.key;
        Object.assign(
          next,
          subProductSelectionCells(
            { key, type: "subproduct", subProducts: field.subProducts, subColumns: field.subColumns },
            String(value ?? ""),
            state.products,
            config?.catalogueRateKey || "RATE",
            unitKey,
            config?.columns?.map((x) => x.key),
          ),
        );
      }
      if (field?.type === "dropdown" && field.lookupProductId && value && !field.rateTableDriven) {
        const source = state.products.find((p) => p.product_id === field.lookupProductId);
        const fillKeys = field.lookupFillKeys?.length
          ? field.lookupFillKeys
          : ["RATE", "DENSITY"];
        const matchKey = field.lookupMatchKey || key;
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
            editableFields.find((x) => x.key.toUpperCase() === srcKey.toUpperCase())?.key ||
            srcKey;
          next[target] = srcVal;
        }
      }
      return next;
    });
  }

  function handleSave() {
    if (!config) return;
    if (computed.error) {
      toast.error(computed.error);
      return;
    }
    const specs: SpecValues = { ...(product.specs || {}) };
    for (const u of editableFields) {
      const v = computed.cells[u.key];
      if (v !== null && v !== undefined && v !== "") {
        specs[u.key.toLowerCase()] = v as string | number;
      }
    }
    // Never persist internal __row_N selector sentinels — store real rate-table identity values
    const cellsToSave = { ...computed.cells };
    if (rateSelect.key) {
      const raw = String(cellsToSave[rateSelect.key] ?? "");
      if (raw.startsWith("__row_")) {
        const match = rateSelect.options.find((o) => o.value === raw);
        if (match) {
          const identity = match.row[rateSelect.key];
          cellsToSave[rateSelect.key] =
            identity !== undefined && identity !== null && identity !== ""
              ? identity
              : match.label;
        }
      }
    }
    const identityKey = rateSelect.key;
    // Prefer the live source rate table when this product syncs to another product
    const baseTable =
      rateSourceProduct?.customizer?.rateTable?.length
        ? rateSourceProduct.customizer.rateTable
        : config.rateTable;
    const nextRateTable = mergeCellsIntoRateTable(
      baseTable,
      cellsToSave,
      identityKey,
    );

    const nextConfig: ProductCustomizerConfig = {
      ...config,
      cells: cellsToSave,
      formulas: { ...(config.formulas || {}) },
      total: computed.total,
      // Same table as the source product (snapshot of source rows + local cell edits)
      rateTable: nextRateTable,
    };
    onSave({
      specs,
      cost_price: computed.total,
      selling_price: computed.total,
      customizer: nextConfig,
    });
    toast.success("Product updated — spreadsheet customizer values saved too.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(calc(100%-2rem),28rem)] max-h-[min(90dvh,36rem)]">
        <DialogHeader>
          <DialogTitle>Edit customized product</DialogTitle>
          <DialogDescription>
            Choose a product to utilize or edit, then adjust its unlocked fields.
          </DialogDescription>
        </DialogHeader>

        {/* First input: product selector */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-ink-muted">Product</label>
          <Select
            className="h-10"
            value={product.product_id}
            onChange={(e) => {
              const nextId = e.target.value;
              if (nextId && nextId !== product.product_id) {
                onSelectProduct?.(nextId);
              }
            }}
          >
            {selectableProducts.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {p.name}
                {p.sku ? ` · ${p.sku}` : ""}
                {p.category ? ` · ${p.category}` : ""}
              </option>
            ))}
          </Select>
          <p className="text-[11px] text-ink-muted">
            Select which customized product you want to utilize or edit.
          </p>
        </div>

        {(() => {
          const links = resolveCatalogueLinks(config, state.products);
          const variants = config.catalogueVariants || {};
          const entries = Object.entries(links);
          if (!entries.length && config.catalogueProductId) {
            entries.push(["RATE", config.catalogueProductId]);
          }
          if (!entries.length) return null;
          return (
            <div className="space-y-2 rounded-md border border-forest/20 bg-paper px-3 py-2">
              <p className="text-xs font-medium text-ink-muted">
                Synced catalogue product — swap dropdown option
              </p>
              {entries.map(([colKey, productId]) => {
                const src = state.products.find((p) => p.product_id === productId);
                const opts = listProductRateOptions(src);
                if (!opts.length) {
                  return (
                    <p key={colKey} className="text-[11px] text-ink-muted">
                      {src?.name || productId}: no product list / rate table to swap
                    </p>
                  );
                }
                const current = variants[colKey] || String(cells[colKey] ?? "");
                return (
                  <div key={colKey} className="space-y-1">
                    <label className="block text-[11px] text-ink-muted">
                      {src?.name || productId}
                      <span className="text-ink-faint"> · {colKey}</span>
                    </label>
                    <Select
                      className="h-9"
                      value={
                        opts.some((o) => o.value === current)
                          ? current
                          : opts.find((o) => o.label === current)?.value || ""
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        const rate = resolveCatalogueRate(src, v);
                        setCells((c) => {
                          const next = { ...c };
                          // Apply rate to RATE / catalogue column keys
                          const rateKey = config.catalogueRateKey || "RATE";
                          if (rate !== null) {
                            next[rateKey] = rate;
                            if (colKey !== rateKey) next[colKey] = rate;
                          }
                          // Mirror option onto identity-like fields when present
                          for (const key of Object.keys(next)) {
                            if (key === rateKey || key === "AMOUNT" || key === "AMOUNT") continue;
                          }
                          const match = opts.find((o) => o.value === v);
                          if (match) {
                            // Prefer filling from full rate-table row when available
                            const table = src?.customizer?.rateTable || [];
                            const row = table.find((r) =>
                              Object.values(r).some(
                                (x) => String(x ?? "").trim().toLowerCase() === v.toLowerCase(),
                              ),
                            );
                            if (row) {
                              for (const [k, val] of Object.entries(row)) {
                                if (String(k).toUpperCase() === "AMOUNT") continue;
                                next[k] = val;
                              }
                            }
                          }
                          return next;
                        });
                      }}
                    >
                      <option value="">Select option…</option>
                      {opts.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                          {o.rate !== undefined ? ` · ${o.rate}` : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {rateSelect.missingRateTable ? (
          <div
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            <p className="font-medium">Rate table missing</p>
            <p className="mt-0.5 text-xs text-amber-800">
              This product has no spreadsheet rate-table rows. Open{" "}
              <span className="font-medium">Spreadsheet product builder</span>, add at least one
              row for each variant, and save — then the first-column dropdown and rate lookups will
              work.
            </p>
          </div>
        ) : null}

        <Card className="space-y-3 border-forest/20 bg-leaf/20 p-4 shadow-none">
          <div className="flex items-start gap-2">
            <Package className="mt-0.5 size-4 shrink-0 text-forest" />
            <div>
              <p className="text-sm font-semibold">Editable fields</p>
              <p className="text-xs text-ink-muted">
                Change these values to refresh product costing and specifications for{" "}
                <span className="font-medium text-ink">{product.name}</span>.
              </p>
            </div>
          </div>

          {editableFields.length === 0 ? (
            <p className="text-xs text-ink-muted">No customizer fields on this product.</p>
          ) : (
            <div className="space-y-4">
              {quoterEditableFields.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-ink-muted">Unlocked columns</p>
                  <div className="grid gap-2">
                    {quoterEditableFields.map((u) => {
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
                                · rows from spreadsheet builder
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
                                {state.products.find(
                                  (p: Product) =>
                                    p.product_id ===
                                    resolveCatalogueLinks(config, state.products)[u.key],
                                )?.name || "Catalogue item"}
                              </span>
                              <span className="font-medium tabular-nums">
                                {money(Number(value ?? 0))}
                              </span>
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
                                    // Linked catalogue product with product list → options for swapping
                                    const src = u.lookupProductId
                                      ? state.products.find((p) => p.product_id === u.lookupProductId)
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
                </div>
              ) : null}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-ink/10 pt-2 text-sm">
            <span className="text-ink-muted">Updated costing</span>
            <span className="font-semibold tabular-nums">{money(computed.total)}</span>
          </div>
          {computed.error ? <p className="text-xs text-red-600">{computed.error}</p> : null}
        </Card>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!!computed.error}>
            <Save className="mr-1 size-4" />
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Inline badge/button to open the customizer edit card when a product has one. */
export function ProductCustomizerEditTrigger({
  product,
  onClick,
}: {
  product: Product;
  onClick: () => void;
}) {
  if (!product.customizer?.columns?.length && !product.customizer?.unlocked?.length) return null;
  return (
    <Button type="button" size="sm" variant="secondary" onClick={onClick}>
      <Package className="mr-1 size-3.5" />
      Edit customized product
    </Button>
  );
}
