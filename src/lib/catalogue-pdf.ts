/** Generate a printable / shareable PDF of a business product catalogue. */

export type CatalogueProduct = {
  name: string;
  category: string;
  sku?: string;
  unit: string;
  selling_price: number;
  stock: number;
  description?: string;
  specs?: Record<string, string | number>;
};

export type CatalogueBusiness = {
  business_name: string;
  business_type?: string;
  phone?: string;
  email?: string;
  region?: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number): string {
  return `KSh ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function specsLine(specs?: Record<string, string | number>): string {
  if (!specs || !Object.keys(specs).length) return "";
  return Object.entries(specs)
    .filter(([, v]) => v !== "" && v != null)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join(" · ");
}

/** Build standalone HTML document for the catalogue. */
export function buildCatalogueHtml(
  business: CatalogueBusiness,
  products: CatalogueProduct[],
  opts?: { title?: string; generatedAt?: Date },
): string {
  const title = opts?.title || `${business.business_name} — Product catalogue`;
  const when = (opts?.generatedAt || new Date()).toLocaleString("en-KE");
  const byCategory = new Map<string, CatalogueProduct[]>();
  for (const p of products) {
    const cat = p.category || "General";
    const list = byCategory.get(cat) || [];
    list.push(p);
    byCategory.set(cat, list);
  }

  const sections = [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cat, items]) => {
      const rows = items
        .map(
          (p) => `
        <tr>
          <td>${esc(p.name)}${p.sku ? `<div class="muted">${esc(p.sku)}</div>` : ""}</td>
          <td>${esc(p.unit)}</td>
          <td class="num">${esc(money(p.selling_price))}</td>
          <td class="num">${p.stock}</td>
          <td class="specs">${esc(specsLine(p.specs) || p.description || "—")}</td>
        </tr>`,
        )
        .join("");
      return `
      <h2>${esc(cat)}</h2>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Unit</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Specs / notes</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)}</title>
  <style>
    :root { --ink: #1a1f2e; --muted: #5c6578; --line: #e2e6ee; --accent: #1f6b4a; }
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", system-ui, sans-serif; color: var(--ink); margin: 0; padding: 32px; font-size: 13px; }
    header { border-bottom: 2px solid var(--accent); padding-bottom: 16px; margin-bottom: 24px; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    .meta { color: var(--muted); font-size: 12px; }
    h2 { font-size: 15px; margin: 28px 0 10px; color: var(--accent); }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { border: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #f4f6f9; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .muted { color: var(--muted); font-size: 11px; margin-top: 2px; }
    .specs { color: var(--muted); font-size: 12px; max-width: 240px; }
    footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; }
    @media print {
      body { padding: 12mm; }
      h2 { break-after: avoid; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${esc(business.business_name)}</h1>
    <div class="meta">
      ${business.business_type ? esc(business.business_type) + " · " : ""}
      ${business.region ? esc(business.region) + " · " : ""}
      ${business.phone ? esc(business.phone) + " · " : ""}
      ${business.email ? esc(business.email) : ""}
    </div>
    <div class="meta">Product catalogue · ${products.length} item${products.length === 1 ? "" : "s"} · Generated ${esc(when)}</div>
  </header>
  ${sections || "<p>No products in this catalogue yet.</p>"}
  <footer>Generated with LifeBoost · Prices subject to change</footer>
  <script>window.onload = function () { /* ready for print */ };</script>
</body>
</html>`;
}

/** Open catalogue in a new window and trigger the browser Print → Save as PDF dialog. */
export function printCataloguePdf(
  business: CatalogueBusiness,
  products: CatalogueProduct[],
): void {
  const html = buildCatalogueHtml(business, products);
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!w) {
    throw new Error("Pop-up blocked. Allow pop-ups to download the PDF, or use Share.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Give the browser a moment to layout before print
  setTimeout(() => {
    w.focus();
    w.print();
  }, 300);
}

/** Download catalogue as a standalone HTML file (easy to share / open offline). */
export function downloadCatalogueHtml(
  business: CatalogueBusiness,
  products: CatalogueProduct[],
): void {
  const html = buildCatalogueHtml(business, products);
  const safe = (business.business_name || "catalogue").replace(/[^\w\-]+/g, "_");
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}-catalogue.html`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Share catalogue via Web Share API when available (mobile), else copy link text. */
export async function shareCatalogue(
  business: CatalogueBusiness,
  products: CatalogueProduct[],
): Promise<"shared" | "downloaded"> {
  const html = buildCatalogueHtml(business, products);
  const safe = (business.business_name || "catalogue").replace(/[^\w\-]+/g, "_");
  const file = new File([html], `${safe}-catalogue.html`, { type: "text/html" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: `${business.business_name} catalogue`,
      text: `Product catalogue for ${business.business_name} (${products.length} items)`,
      files: [file],
    });
    return "shared";
  }
  if (navigator.share) {
    await navigator.share({
      title: `${business.business_name} catalogue`,
      text: `Product catalogue — ${products.length} items. Open LifeBoost to view full list.`,
    });
    return "shared";
  }
  downloadCatalogueHtml(business, products);
  return "downloaded";
}
