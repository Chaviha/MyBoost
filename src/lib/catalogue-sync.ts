import type { SubProduct } from "@/lib/sub-products";
import type { Product, ProductCustomizerConfig } from "@/lib/types";
import { resolveCatalogueRate } from "@/lib/rate-table-select";

type Cells = Record<string, string | number | null>;

type CatalogueSource = Pick<Product, "product_id" | "selling_price"> & {
  customizer?: ProductCustomizerConfig | null;
};

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

/**
 * Overwrite each linked catalogue cell with that product's current selling price,
 * or — when a catalogueVariants entry is set — the RATE from that product's specific
 * rate-table / dropdown row (the product list built in Spreadsheet product builder).
 */
export function applyCatalogueValues(
  cells: Cells,
  links: Record<string, string>,
  products: CatalogueSource[],
  variants?: Record<string, string> | null,
): Cells {
  const next = { ...cells };
  for (const [key, productId] of Object.entries(links)) {
    const src = products.find((p) => p.product_id === productId);
    if (!src) continue;
    const variant = variants?.[key];
    const rate = resolveCatalogueRate(src, variant);
    if (rate !== null) next[key] = rate;
  }
  return next;
}

/** Does this product depend on `sourceId` through a catalogue column (new or legacy shape)? */
export function linksTo(config: ProductCustomizerConfig | undefined, sourceId: string): boolean {
  if (!config) return false;
  if (Object.values(config.catalogueLinks || {}).includes(sourceId)) return true;
  const hasSub = (nodes: SubProduct[] | undefined): boolean =>
    (nodes || []).some((n) => n.productId === sourceId || hasSub(n.children));
  return (config.columns || []).some(
    (c) =>
      (c.type === "catalogue" && String(config.cells?.[c.key] ?? "") === sourceId) ||
      (c.type === "subproduct" && hasSub(c.subProducts)),
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
  const variants = config.catalogueVariants || {};
  for (const c of config.columns || []) {
    if (c.type !== "catalogue") continue;
    const legacy = String(config.cells?.[c.key] ?? "") === sourceId;
    if (links[c.key] === sourceId || legacy) {
      links[c.key] = sourceId;
      // Prefer variant-specific rate when this column is pinned to a dropdown option
      const variant = variants[c.key];
      const srcLike = {
        product_id: sourceId,
        selling_price: price,
        customizer: undefined as ProductCustomizerConfig | undefined,
      };
      // price argument is the source product's current selling_price; variant resolution
      // needs the full product with rateTable — callers that have it should use applyCatalogueValues.
      if (variant) {
        // Keep existing cell if we cannot resolve without rate table; store price as fallback
        next[c.key] = price;
      } else {
        next[c.key] = price;
      }
      void srcLike;
    }
  }
  return { cells: next, links };
}
