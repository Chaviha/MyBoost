import { evaluateFormula } from "@/lib/formula-eval";
import type { ProductCustomizerColumn } from "@/lib/types";

type Cells = Record<string, string | number | null>;
type Col = Pick<ProductCustomizerColumn, "key" | "label" | "type" | "costingSourceKey">;

/** A checkbox cell is "included" unless it was explicitly set to "false". */
export function isCostingChecked(value: unknown): boolean {
  return String(value ?? "true") === "true";
}

/** Checkbox columns that point at a cell (number / formula / catalogue) to add when checked. */
export function linkedCostingToggles<T extends Col>(columns?: T[] | null): T[] {
  return (columns || []).filter((c) => c.type === "checkbox" && !!c.costingSourceKey);
}

/**
 * Final product cost.
 * - With linked checkbox columns: sum of the source value of every CHECKED box
 *   (e.g. both boxes ticked → value A + value B; unticked boxes add nothing).
 * - Legacy sheets with one unlinked checkbox: AMOUNT, or 0 when unchecked.
 * - No checkbox columns: AMOUNT unchanged.
 * `cells` must already contain evaluated formula values.
 */
export function applyCheckboxCosting(
  cells: Cells,
  columns: Col[] | undefined | null,
  rawAmount: number,
): number {
  const linked = linkedCostingToggles(columns);
  if (linked.length) {
    return linked.reduce((sum, toggle) => {
      const value = Number(cells[toggle.costingSourceKey!] ?? 0);
      return sum + (isCostingChecked(cells[toggle.key]) && Number.isFinite(value) ? value : 0);
    }, 0);
  }
  const legacy = (columns || []).find((c) => c.type === "checkbox");
  if (legacy && !isCostingChecked(cells[legacy.key])) return 0;
  return rawAmount;
}

type DepCol = Col & { formula?: string };

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The source column plus every column its formula (recursively) depends on. */
export function costingDependencies(
  sourceKey: string,
  columns: DepCol[],
  formulas?: Record<string, string>,
): Set<string> {
  const out = new Set<string>();
  const walk = (key: string) => {
    if (out.has(key)) return;
    out.add(key);
    const col = columns.find((c) => c.key === key);
    if (!col || col.type !== "formula") return;
    const expr = String(formulas?.[key] ?? col.formula ?? "");
    for (const c of columns) {
      if (c.key !== key && new RegExp(`\\b${escapeRe(c.key)}\\b`, "i").test(expr)) walk(c.key);
    }
  };
  walk(sourceKey);
  return out;
}

/**
 * Column keys to hide in the edit / quote dialogs: inputs that only feed
 * costing checkboxes which are currently UNCHECKED. Inputs also needed by a
 * checked box (or not tied to any costing box) stay visible.
 */
export function hiddenCostingFields(
  cells: Cells,
  columns: DepCol[] | undefined | null,
  formulas?: Record<string, string>,
): Set<string> {
  const cols = columns || [];
  const needed = new Set<string>();
  const candidates = new Set<string>();
  for (const t of linkedCostingToggles(cols)) {
    const deps = costingDependencies(t.costingSourceKey!, cols, formulas);
    for (const k of deps) (isCostingChecked(cells[t.key]) ? needed : candidates).add(k);
  }
  return new Set([...candidates].filter((k) => !needed.has(k)));
}

/**
 * Final cost of a saved customizer product from its cells, used wherever a price
 * is recalculated outside the edit dialogs (e.g. when a linked catalogue rate changes).
 * Evaluates every formula column in order, then applies the checkbox rule:
 * sum of ticked costing boxes when they exist, otherwise the final AMOUNT value.
 * Returns `fallback` if a formula can't be evaluated.
 */
export function computeCustomizerTotal(
  config: { columns?: DepCol[]; formulas?: Record<string, string>; total?: number },
  cells: Cells,
  fallback: number,
): number {
  const columns = config.columns || [];
  const next: Cells = { ...cells };
  try {
    const keys = columns.map((c) => c.key).sort((a, b) => b.length - a.length);
    for (const col of columns) {
      if (col.type !== "formula") continue;
      let expr = String(config.formulas?.[col.key] ?? col.formula ?? "0").trim().replace(/^=/, "") || "0";
      for (const key of keys) {
        const raw = next[key];
        const num = typeof raw === "number" ? raw : Number(raw ?? 0);
        expr = expr.replace(new RegExp(`\\b${escapeRe(key)}\\b`, "gi"), String(Number.isFinite(num) ? num : 0));
      }
      next[col.key] = evaluateFormula(expr);
    }
    const amountCol =
      columns.find((c) => c.key === "AMOUNT" && c.type === "formula") ||
      columns.filter((c) => c.type === "formula").at(-1);
    const raw = amountCol ? Number(next[amountCol.key] ?? 0) : fallback;
    const total = applyCheckboxCosting(next, columns, Number.isFinite(raw) ? raw : fallback);
    return Number.isFinite(total) ? total : fallback;
  } catch {
    return fallback;
  }
}
