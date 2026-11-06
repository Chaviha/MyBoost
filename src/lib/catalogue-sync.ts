import type { Product, ProductCustomizerConfig } from "@/lib/types";

type Cells = Record<string, string | number | null>;

/**
 * A "catalogue" column holds the catalogue product's synced selling price (a number),
 * never the product id. The id link lives separately in `catalogueLinks` (columnKey → product_id).
 *
 * Older saved products stored the product id in the cell itself; this resolves both shapes.
 */
export function resolveCatalogueLinks(
  config: Pick<ProductCustomizerConfig, "columns" | "cells" | "catalogueLinks"> | undefined,
  products: Array<{ product_id?: string }>,
): Record<string, string> {
  const links: Record<string, string> = { ...(config?.catalogueLinks || {}) };
  for (const col of config?.columns || []) {
    if (col.type !== "catalogue" || links[col.key]) continue;
    const raw = String(config?.cells?.[col.key] ?? "");
    if (raw && products.some((p) => p.product_id === raw)) links[col.key] = raw; // legacy: id in cell
  }
  return links;
}

/** Overwrite each linked catalogue cell with that product's current selling price. */
export function applyCatalogueValues(
  cells: Cells,
  links: Record<string, string>,
  products: Array<Pick<Product, "product_id" | "selling_price">>,
): Cells {
  const next = { ...cells };
  for (const [key, productId] of Object.entries(links)) {
    const src = products.find((p) => p.product_id === productId);
    if (src && typeof src.selling_price === "number") next[key] = src.selling_price;
  }
  return next;
}

/** Does this product depend on `sourceId` through a catalogue column (new or legacy shape)? */
export function linksTo(config: ProductCustomizerConfig | undefined, sourceId: string): boolean {
  if (!config) return false;
  if (Object.values(config.catalogueLinks || {}).includes(sourceId)) return true;
  return (config.columns || []).some(
    (c) => c.type === "catalogue" && String(config.cells?.[c.key] ?? "") === sourceId,
  );
}

/** Set every catalogue column linked to `sourceId` to `price`, and return the migrated links. */
export function syncCataloguePrice(
  config: ProductCustomizerConfig,
  cells: Cells,
  sourceId: string,
  price: number,
): { cells: Cells; links: Record<string, string> } {
  const links = { ...(config.catalogueLinks || {}) };
  const next = { ...cells };
  for (const c of config.columns || []) {
    if (c.type !== "catalogue") continue;
    const legacy = String(config.cells?.[c.key] ?? "") === sourceId;
    if (links[c.key] === sourceId || legacy) {
      links[c.key] = sourceId;
      next[c.key] = price;
    }
  }
  return { cells: next, links };
}
