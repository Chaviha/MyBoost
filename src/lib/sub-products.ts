import { uid } from "@/lib/format";
import { evaluateFormula } from "@/lib/formula-eval";

/**
 * A product nested inside a product. Sub-products form a tree: picking one in a
 * "Sub-products" column shows a dropdown for each layer (parent → child → …).
 * Each product is a row of its own small spreadsheet (see SubColumnDef); picking it
 * copies that row's values into the main sheet.
 */
export type SubProduct = {
  id: string;
  name: string;
  /** Fixed rate. Ignored when `productId` is set and that catalogue product is found. */
  rate?: number;
  unit?: string;
  /** Raw cell text per sub-column key (numbers are parsed when used). */
  values?: Record<string, string | number>;
  /** Catalogue-type sub-columns: column key → linked catalogue product_id. */
  links?: Record<string, string>;
  /** Catalogue product whose live selling_price supplies the rate. */
  productId?: string;
  children?: SubProduct[];
};

/** A column of the sub-product grid. Each can be text, number, formula or catalogue. */
export type SubColumnDef = {
  key: string;
  label: string;
  type: "text" | "number" | "formula" | "catalogue";
  /** Formula columns: expression over this grid's column keys, e.g. =THICKNESS*DENSITY */
  formula?: string;
  /**
   * Which sheet column this fills when a product is picked.
   * undefined = the sheet column with the same key (if any); "" = don't fill the sheet.
   */
  target?: string;
};

/** Separator used in the cell's readable label, e.g. "Pipe › CHS › 50NB". */
export const SUB_SEP = " › ";

export function newSubProduct(name = ""): SubProduct {
  return { id: uid("SP"), name };
}

type PriceSource = { product_id?: string; selling_price?: number };

/** Walk the tree following a label path; returns the nodes picked at each layer. */
export function nodesFromLabel(tree: SubProduct[] | undefined, label: string): SubProduct[] {
  const out: SubProduct[] = [];
  if (!label) return out;
  let level = tree || [];
  for (const part of label.split(SUB_SEP)) {
    const node = level.find((n) => n.name === part);
    if (!node) break;
    out.push(node);
    level = node.children || [];
  }
  return out;
}

export function labelFromNodes(nodes: SubProduct[]): string {
  return nodes.map((n) => n.name).join(SUB_SEP);
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * One product's computed row: text/number cells as typed, catalogue cells at the linked
 * product's live price, formula cells evaluated over the row (in column order).
 */
export function rowValues(
  node: SubProduct,
  subColumns: SubColumnDef[],
  products: PriceSource[] = [],
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const c of subColumns) {
    if (c.type === "formula") continue;
    if (c.type === "catalogue") {
      const id = node.links?.[c.key];
      const live = id ? products.find((p) => p.product_id === id) : undefined;
      if (live && typeof live.selling_price === "number") out[c.key] = live.selling_price;
      else if (node.values?.[c.key] !== undefined && node.values[c.key] !== "") out[c.key] = node.values[c.key];
      continue;
    }
    const raw = node.values?.[c.key];
    if (raw === undefined || raw === "") continue;
    out[c.key] = c.type === "number" ? toNum(raw) : raw;
  }
  for (const c of subColumns) {
    if (c.type !== "formula" || !c.formula) continue;
    let expr = c.formula.trim().replace(/^=/, "");
    const keys = subColumns.map((x) => x.key).sort((a, b) => b.length - a.length);
    for (const k of keys) expr = expr.replace(new RegExp(`\\b${k}\\b`, "gi"), String(toNum(out[k])));
    try {
      out[c.key] = evaluateFormula(expr);
    } catch {
      /* leave blank on formula error */
    }
  }
  return out;
}

/** Rate / unit / column values supplied by the picked path (deeper products override parents). */
export function resolveSubProduct(
  tree: SubProduct[] | undefined,
  label: string,
  products: PriceSource[] = [],
  subColumns?: SubColumnDef[],
): { nodes: SubProduct[]; rate?: number; unit?: string; values: Record<string, string | number> } {
  const nodes = nodesFromLabel(tree, label);
  let rate: number | undefined;
  let unit: string | undefined;
  const values: Record<string, string | number> = {};
  for (const n of nodes) {
    Object.assign(values, subColumns?.length ? rowValues(n, subColumns, products) : n.values || {});
  }
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const live = n.productId ? products.find((p) => p.product_id === n.productId) : undefined;
    if (rate === undefined) {
      if (live && typeof live.selling_price === "number") rate = live.selling_price;
      else if (typeof n.rate === "number") rate = n.rate;
    }
    if (unit === undefined && n.unit) unit = n.unit;
  }
  return { nodes, rate, unit, values };
}

/** Sheet column a grid column fills (undefined = not filling the sheet). */
function targetFor(key: string, defs: SubColumnDef[] | undefined, columnKeys: string[] | undefined): string | undefined {
  const def = defs?.find((d) => d.key === key);
  const want = def && def.target !== undefined ? def.target : key;
  if (!want) return undefined;
  return (columnKeys || []).find((c) => c.toUpperCase() === want.toUpperCase());
}

/** Map grid values onto the sheet's real column keys; numeric text fills as a number. */
function valuePatch(
  values: Record<string, string | number>,
  columnKeys: string[] | undefined,
  defs?: SubColumnDef[],
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(values)) {
    const target = targetFor(k, defs, columnKeys);
    if (!target) continue;
    out[target] = typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
  }
  return out;
}

/** Every sheet column this dropdown drives → its blank default (0 for numbers, "" for text). */
export function controlledColumns(
  tree: SubProduct[] | undefined,
  columnKeys: string[] | undefined,
  defs?: SubColumnDef[],
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (defs?.length) {
    for (const d of defs) {
      const target = targetFor(d.key, defs, columnKeys);
      if (target) out[target] = d.type === "text" ? "" : 0;
    }
    return out;
  }
  const walk = (nodes: SubProduct[]) => {
    for (const n of nodes) {
      for (const [k, v] of Object.entries(n.values || {})) {
        const target = targetFor(k, undefined, columnKeys);
        if (!target) continue;
        const numeric = typeof v === "number" || (String(v).trim() !== "" && Number.isFinite(Number(v)));
        if (!(target in out) || (out[target] === "" && numeric)) out[target] = numeric ? 0 : "";
      }
      if (n.children) walk(n.children);
    }
  };
  walk(tree || []);
  return out;
}

type SubColumn = { key: string; type: string; subProducts?: SubProduct[]; subColumns?: SubColumnDef[] };

/** Refill the sheet from every sub-product column's current selection (keeps linked prices live). */
export function applySubProductRates(
  cells: Record<string, string | number | null>,
  columns: SubColumn[] | undefined,
  products: PriceSource[],
  rateKey: string,
): Record<string, string | number | null> {
  let next = cells;
  const keys = (columns || []).map((c) => c.key);
  for (const col of columns || []) {
    if (col.type !== "subproduct") continue;
    const label = String(cells[col.key] ?? "");
    if (!label) continue;
    const { rate, values } = resolveSubProduct(col.subProducts, label, products, col.subColumns);
    if (rate !== undefined && next[rateKey] !== rate) next = { ...next, [rateKey]: rate };
    for (const [k, v] of Object.entries(valuePatch(values, keys, col.subColumns))) {
      if (k !== col.key && next[k] !== v) next = { ...next, [k]: v };
    }
  }
  return next;
}

/** Cells to write when the user picks a sub-product: the label, plus RATE / UNIT / grid values. */
export function subProductSelectionCells(
  col: SubColumn,
  label: string,
  products: PriceSource[],
  rateKey: string | undefined,
  unitKey: string | undefined,
  columnKeys?: string[],
): Record<string, string | number | null> {
  const patch: Record<string, string | number | null> = {};
  const { rate, unit, values } = resolveSubProduct(col.subProducts, label, products, col.subColumns);
  // Excel-style: columns driven by this dropdown reset first, so switching MS → Aluminium
  // never leaves MS's leftover values behind; then the new pick fills its own.
  Object.assign(patch, controlledColumns(col.subProducts, columnKeys, col.subColumns));
  Object.assign(patch, valuePatch(values, columnKeys, col.subColumns));
  patch[col.key] = label;
  if (rateKey && rate !== undefined) patch[rateKey] = rate;
  if (unitKey && unit) patch[unitKey] = unit;
  return patch;
}

/** Columns for a grid saved before sub-columns existed: one text column per key used in the tree. */
export function deriveSubColumns(tree: SubProduct[] | undefined): SubColumnDef[] {
  const kinds = new Map<string, boolean>();
  const walk = (nodes: SubProduct[]) => {
    for (const n of nodes) {
      for (const [k, v] of Object.entries(n.values || {})) {
        const numeric = typeof v === "number" || (String(v).trim() !== "" && Number.isFinite(Number(v)));
        kinds.set(k, (kinds.get(k) ?? true) && numeric);
      }
      if (n.children) walk(n.children);
    }
  };
  walk(tree || []);
  return [...kinds.entries()].map(([key, numeric]) => ({
    key,
    label: key,
    type: numeric ? ("number" as const) : ("text" as const),
  }));
}

// ---- immutable tree edits (used by the builder) ----
export function updateSubProduct(tree: SubProduct[], id: string, patch: Partial<SubProduct>): SubProduct[] {
  return tree.map((n) =>
    n.id === id ? { ...n, ...patch } : { ...n, children: n.children ? updateSubProduct(n.children, id, patch) : undefined },
  );
}

export function addSiblingSubProduct(tree: SubProduct[], siblingId: string, node: SubProduct): SubProduct[] {
  const out: SubProduct[] = [];
  for (const n of tree) {
    const kids = n.children ? addSiblingSubProduct(n.children, siblingId, node) : undefined;
    out.push(kids ? { ...n, children: kids } : n);
    if (n.id === siblingId) out.push(node);
  }
  return out;
}

export function addSubProduct(tree: SubProduct[], parentId: string | null, node: SubProduct): SubProduct[] {
  if (parentId === null) return [...tree, node];
  return tree.map((n) =>
    n.id === parentId
      ? { ...n, children: [...(n.children || []), node] }
      : { ...n, children: n.children ? addSubProduct(n.children, parentId, node) : undefined },
  );
}

export function removeSubProduct(tree: SubProduct[], id: string): SubProduct[] {
  return tree
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: n.children ? removeSubProduct(n.children, id) : undefined }));
}

/** Drop a deleted grid column's data from every product. */
export function stripSubColumn(tree: SubProduct[], key: string): SubProduct[] {
  return tree.map((n) => {
    const values = { ...(n.values || {}) };
    const links = { ...(n.links || {}) };
    delete values[key];
    delete links[key];
    return {
      ...n,
      values: Object.keys(values).length ? values : undefined,
      links: Object.keys(links).length ? links : undefined,
      children: n.children ? stripSubColumn(n.children, key) : undefined,
    };
  });
}
