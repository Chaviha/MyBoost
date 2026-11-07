import { uid } from "@/lib/format";

/**
 * A product nested inside a product. Sub-products form a tree: picking one in a
 * "Sub-products" column shows a dropdown for each layer (parent → child → …).
 * The deepest picked node supplies the RATE (and UNIT) for the row.
 */
export type SubProduct = {
  id: string;
  name: string;
  /** Fixed rate. Ignored when `productId` is set and that catalogue product is found. */
  rate?: number;
  unit?: string;
  /**
   * Extra column values this product carries, keyed by sheet column key
   * (e.g. THICKNESS, DENSITY, GRADE). Picking the product fills those columns.
   * A deeper product's values override its parents'.
   */
  values?: Record<string, string | number>;
  /** Catalogue product whose live selling_price supplies the rate. */
  productId?: string;
  children?: SubProduct[];
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

/** Rate / unit supplied by the deepest picked node that has one. */
export function resolveSubProduct(
  tree: SubProduct[] | undefined,
  label: string,
  products: PriceSource[] = [],
): { nodes: SubProduct[]; rate?: number; unit?: string; values: Record<string, string | number> } {
  const nodes = nodesFromLabel(tree, label);
  let rate: number | undefined;
  let unit: string | undefined;
  // root → leaf so deeper products override their parents' values
  const values: Record<string, string | number> = {};
  for (const n of nodes) Object.assign(values, n.values || {});
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

/** Map a node's value keys onto the sheet's real column keys (case-insensitive). */
function valuePatch(
  values: Record<string, string | number>,
  columnKeys: string[] | undefined,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(values)) {
    const target = (columnKeys || []).find((c) => c.toUpperCase() === k.toUpperCase());
    if (!target) continue;
    // Grid cells hold raw text; numeric text fills as a number so formulas can use it
    out[target] = typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
  }
  return out;
}

/** Every sheet column that some product in the tree sets a value for → its blank default. */
export function controlledColumns(
  tree: SubProduct[] | undefined,
  columnKeys: string[] | undefined,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const walk = (nodes: SubProduct[]) => {
    for (const n of nodes) {
      for (const [k, v] of Object.entries(n.values || {})) {
        const target = (columnKeys || []).find((c) => c.toUpperCase() === k.toUpperCase());
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

type SubColumn = { key: string; type: string; subProducts?: SubProduct[] };

/** Refill RATE from every sub-product column's current selection (keeps linked prices live). */
export function applySubProductRates(
  cells: Record<string, string | number | null>,
  columns: SubColumn[] | undefined,
  products: PriceSource[],
  rateKey: string,
): Record<string, string | number | null> {
  let next = cells;
  for (const col of columns || []) {
    if (col.type !== "subproduct") continue;
    const label = String(cells[col.key] ?? "");
    if (!label) continue;
    const { rate, values } = resolveSubProduct(col.subProducts, label, products);
    if (rate !== undefined && next[rateKey] !== rate) next = { ...next, [rateKey]: rate };
    for (const [k, v] of Object.entries(valuePatch(values, (columns || []).map((c) => c.key)))) {
      if (k !== col.key && next[k] !== v) next = { ...next, [k]: v };
    }
  }
  return next;
}

/** Cells to write when the user picks a sub-product: the label, plus RATE / UNIT from the pick. */
export function subProductSelectionCells(
  col: SubColumn,
  label: string,
  products: PriceSource[],
  rateKey: string | undefined,
  unitKey: string | undefined,
  columnKeys?: string[],
): Record<string, string | number | null> {
  const patch: Record<string, string | number | null> = {};
  const { rate, unit, values } = resolveSubProduct(col.subProducts, label, products);
  // Excel-style: columns driven by this dropdown reset first, so switching MS → Aluminium
  // never leaves MS's leftover values behind; then the new pick fills its own.
  Object.assign(patch, controlledColumns(col.subProducts, columnKeys));
  Object.assign(patch, valuePatch(values, columnKeys));
  patch[col.key] = label;
  if (rateKey && rate !== undefined) patch[rateKey] = rate;
  if (unitKey && unit) patch[unitKey] = unit;
  return patch;
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
