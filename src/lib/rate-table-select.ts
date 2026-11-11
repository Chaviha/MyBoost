import type { ProductCustomizerConfig } from "@/lib/types";

/** Prefer a stable identity column for rate-table row selection. */
export function pickRowSelectKey(config: ProductCustomizerConfig | undefined): string | null {
  const columns = config?.columns || [];
  const preferred = ["DESCRIPTION", "MATERIAL", "OPTION", "TYPE", "SIZE", "NAME"];
  for (const key of preferred) {
    const col = columns.find((c) => c.key.toUpperCase() === key && c.type !== "formula");
    if (col) return col.key;
  }
  const first = columns.find((c) => c.type !== "formula");
  return first?.key || null;
}

export type RateTableOption = {
  value: string;
  label: string;
  row: Record<string, string | number | null>;
  index: number;
};

/**
 * Build dropdown options from spreadsheet builder rate-table rows.
 * Each row added in the builder becomes one option; selecting it restores that row's cells.
 */
export function rateTableSelectOptions(config: ProductCustomizerConfig | undefined): {
  key: string | null;
  options: RateTableOption[];
  /** True when this product is spreadsheet-built but has no rate table rows. */
  missingRateTable: boolean;
} {
  const table = Array.isArray(config?.rateTable) ? config!.rateTable! : [];
  const key = pickRowSelectKey(config);
  const isSpreadsheet =
    config?.calculator === "advanced-spreadsheet" || Boolean(config?.columns?.length);

  if (!key || !table.length) {
    return {
      key,
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
export function applyRateTableRow(
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

/**
 * List rate-table / dropdown options available on a source catalogue product
 * (the product list built in Spreadsheet product builder).
 */
export function listProductRateOptions(
  product:
    | {
        customizer?: ProductCustomizerConfig | null;
        selling_price?: number;
        name?: string;
      }
    | null
    | undefined,
): Array<{ value: string; label: string; rate?: number }> {
  const config = product?.customizer || undefined;
  const { options } = rateTableSelectOptions(config);
  if (options.length) {
    const idKey = pickRowSelectKey(config);
    return options.map((o) => {
      const rateRaw = o.row.RATE ?? o.row.Rate ?? o.row.rate ?? o.row.AMOUNT ?? o.row.Amount;
      const rate = rateRaw !== undefined && rateRaw !== null && rateRaw !== "" ? Number(rateRaw) : undefined;
      const value =
        (idKey && String(o.row[idKey] ?? "").trim()) ||
        String(o.label).replace(/\s—\s.*$/, "").trim() ||
        o.label;
      return {
        value,
        label: o.label,
        rate: Number.isFinite(rate) ? rate : undefined,
      };
    });
  }
  const dropdownOpts = (config?.columns || [])
    .filter((c) => c.type === "dropdown" || (c as { type?: string }).type === "size")
    .flatMap((c) => (c.options || []).map(String));
  const unique = [...new Set(dropdownOpts.filter(Boolean))];
  return unique.map((value) => ({ value, label: value }));
}

/**
 * Resolve a synced numeric rate from a catalogue product, optionally for a specific
 * rate-table / dropdown option (variant). Falls back to product.selling_price.
 */
export function resolveCatalogueRate(
  product:
    | {
        customizer?: ProductCustomizerConfig | null;
        selling_price?: number;
      }
    | null
    | undefined,
  variant?: string | null,
): number | null {
  if (!product) return null;
  if (variant && String(variant).trim()) {
    const want = String(variant).trim().toLowerCase();
    const table = product.customizer?.rateTable || [];
    const key = pickRowSelectKey(product.customizer || undefined);
    const row = table.find((r) => {
      if (key && String(r[key] ?? "").trim().toLowerCase() === want) return true;
      return Object.values(r).some((v) => String(v ?? "").trim().toLowerCase() === want);
    });
    if (row) {
      const rateRaw = row.RATE ?? row.Rate ?? row.rate ?? row.AMOUNT ?? row.Amount;
      const n = Number(rateRaw);
      if (Number.isFinite(n)) return n;
    }
  }
  if (typeof product.selling_price === "number" && Number.isFinite(product.selling_price)) {
    return product.selling_price;
  }
  return null;
}
