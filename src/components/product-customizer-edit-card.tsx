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
import { lookupRatesFromProduct } from "@/components/advanced-quotation-calculator";
import { useLife } from "@/lib/store";
import { applyCatalogueValues, resolveCatalogueLinks } from "@/lib/catalogue-sync";

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

type Props = {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true (product creator / catalogue owner), locked sizes are editable. Quoters: false. */
  creatorMode?: boolean;
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
}: Props) {
  const config = product.customizer;
  const { state } = useLife();
  const [cells, setCells] = useState<Record<string, string | number | null>>(
    () => ({ ...(config?.cells || {}) }),
  );

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
      setCells(applyCatalogueValues(next, resolveCatalogueLinks(config, state.products), state.products));
    }
  }, [open, product.product_id, config, product.reference_product_id, state.products]);

  const unlocked = config?.unlocked || [];
  /** Only unlocked fields are shown: locked sizes and columns with Editable unchecked are hidden. */
  const editableFields = (() => {
    if (config?.columns?.length) {
      return config.columns
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
            locked: lockedForQuoter,
          };
        });
    }
    return unlocked.map((u) => ({
      key: u.key,
      label: u.label,
      type: u.type === "size" ? "dropdown" : u.type,
      unit: u.unit,
      options: (u.options || []).map(String),
      lookupProductId: u.lookupProductId,
      lookupMatchKey: u.lookupMatchKey,
      lookupFillKeys: u.lookupFillKeys,
      locked: false,
    }));
  })();
  const quoterEditableFields = editableFields;
  const computed = useMemo(() => {
    if (!config) return { cells, total: product.selling_price, error: undefined as string | undefined };
    return evaluateFormulas(cells, config);
  }, [cells, config, product.selling_price]);

  if (!config) return null;

  function updateField(key: string, value: string | number | null) {
    setCells((c) => {
      const next: Record<string, string | number | null> = { ...c, [key]: value };
      const field = editableFields.find((u) => u.key === key);
      if (field?.type === "dropdown" && field.lookupProductId && value) {
        const source = state.products.find((p) => p.product_id === field.lookupProductId);
        const fillKeys = field.lookupFillKeys?.length
          ? field.lookupFillKeys
          : ["RATE", "DENSITY"];
        const matchKey = field.lookupMatchKey || key;
        const filled = lookupRatesFromProduct(source, String(value), matchKey, fillKeys);
        for (const [srcKey, srcVal] of Object.entries(filled)) {
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
    const nextConfig: ProductCustomizerConfig = {
      ...config,
      cells: computed.cells,
      total: computed.total,
    };
    onSave({
      specs,
      cost_price: computed.total,
      selling_price: computed.total,
      customizer: nextConfig,
    });
    toast.success("Product updated from editable fields.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(calc(100%-2rem),28rem)] max-h-[min(90dvh,36rem)]">
        <DialogHeader>
          <DialogTitle>Edit customized product</DialogTitle>
          <DialogDescription>
            Customizer fields for <span className="font-medium text-ink">{product.name}</span>.
            {" Only unlocked fields are shown."}
          </DialogDescription>
        </DialogHeader>

        <Card className="space-y-3 border-forest/20 bg-leaf/20 p-4 shadow-none">
          <div className="flex items-start gap-2">
            <Package className="mt-0.5 size-4 shrink-0 text-forest" />
            <div>
              <p className="text-sm font-semibold">Editable fields</p>
              <p className="text-xs text-ink-muted">
                Change these values to refresh product costing and specifications.
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
                          </label>
                          {u.type === "catalogue" ? (
                            <div className="flex h-9 items-center justify-between rounded-md border border-ink/10 bg-leaf/30 px-3 text-sm">
                              <span className="truncate text-ink-muted">
                                {state.products.find(
                                  (p) =>
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
                              value={value === null || value === undefined ? "" : String(value)}
                              onChange={(e) => updateField(u.key, e.target.value)}
                            >
                              <option value="">Select…</option>
                              {dropdownOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                  {u.unit ? ` ${u.unit}` : ""}
                                </option>
                              ))}
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
