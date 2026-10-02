/** Build printable / downloadable quotation documents (HTML + browser PDF). */

import type { Quotation, QuoteLineItem } from "./types";

export type QuoteExportBusiness = {
  business_name: string;
  phone?: string;
  email?: string;
  region?: string;
};

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number): string {
  return `KSh ${Number(n || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-KE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function lineRows(items: QuoteLineItem[] | undefined): string {
  if (!items?.length) {
    return `<tr><td colspan="5" style="padding:12px;color:#666">No line items</td></tr>`;
  }
  return items
    .map(
      (li) => `
    <tr>
      <td>${esc(li.description)}</td>
      <td class="num">${Number(li.qty).toLocaleString("en-KE", { maximumFractionDigits: 3 })}</td>
      <td>${esc(li.unit)}</td>
      <td class="num">${esc(money(li.rate))}</td>
      <td class="num">${esc(money(li.amount))}</td>
    </tr>`,
    )
    .join("");
}

/** Full HTML document for a quotation (view / download / print-to-PDF). */
export function buildQuoteHtml(
  quote: Quotation,
  business: QuoteExportBusiness,
  opts?: { title?: string },
): string {
  const title =
    opts?.title ||
    `Quotation ${quote.quote_id} — ${quote.customer_name} — ${business.business_name}`;
  const items = quote.line_items || [];
  const subtotal = items.reduce((s, li) => s + Number(li.amount || 0), 0);
  const total = Number(quote.total) || subtotal;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)}</title>
  <style>
    :root { --ink: #1a1f2e; --muted: #5c6578; --line: #e2e6ee; --accent: #2c5a42; }
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", system-ui, sans-serif; color: var(--ink); margin: 0; padding: 32px; font-size: 13px; }
    header { border-bottom: 2px solid var(--accent); padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    h1 { margin: 0 0 6px; font-size: 22px; color: var(--accent); }
    .muted { color: var(--muted); font-size: 12px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .box { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
    .box h3 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); border-bottom: 1px solid var(--line); padding: 8px 6px; }
    td { padding: 10px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .totals { margin-left: auto; width: min(280px, 100%); }
    .totals .row { display: flex; justify-content: space-between; padding: 6px 0; }
    .totals .grand { font-size: 16px; font-weight: 600; border-top: 2px solid var(--accent); padding-top: 10px; margin-top: 6px; }
    footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); }
    @media print {
      body { padding: 12px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${esc(business.business_name)}</h1>
      <p class="muted">
        ${[business.phone, business.email, business.region].filter(Boolean).map(esc).join(" · ") || "Fabrication quotation"}
      </p>
    </div>
    <div style="text-align:right">
      <p style="margin:0;font-size:18px;font-weight:600">QUOTATION</p>
      <p class="muted" style="margin:4px 0 0">${esc(quote.quote_id)}</p>
      <p class="muted">${esc(formatDate(quote.date))} · ${esc(quote.status)}</p>
    </div>
  </header>

  <div class="meta">
    <div class="box">
      <h3>Bill to</h3>
      <p style="margin:0;font-weight:600">${esc(quote.customer_name)}</p>
    </div>
    <div class="box">
      <h3>Details</h3>
      <p style="margin:0" class="muted">Type: ${esc(quote.quote_type || "general")}</p>
      ${quote.pricing_business_name ? `<p class="muted" style="margin:4px 0 0">Priced from: ${esc(quote.pricing_business_name)}</p>` : ""}
      ${quote.notes ? `<p style="margin:8px 0 0">${esc(quote.notes)}</p>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty</th>
        <th>Unit</th>
        <th class="num">Rate</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows(items)}
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span class="muted">Subtotal</span><span>${esc(money(subtotal))}</span></div>
    <div class="row grand"><span>Total</span><span>${esc(money(total))}</span></div>
  </div>

  <footer>
    Generated by LifeBoost · ${esc(new Date().toLocaleString("en-KE"))}
    <span class="no-print"> · Use browser Print → Save as PDF for a PDF copy</span>
  </footer>
</body>
</html>`;
}

/** Trigger browser download of an HTML file. */
export function downloadQuoteHtml(quote: Quotation, business: QuoteExportBusiness): void {
  const html = buildQuoteHtml(quote, business);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quotation-${quote.quote_id}-${quote.customer_name.replace(/\s+/g, "-")}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Open print dialog (user can choose "Save as PDF").
 * Uses a temporary iframe so the main app is not navigated away.
 */
export function printQuotePdf(quote: Quotation, business: QuoteExportBusiness): void {
  const html = buildQuoteHtml(quote, business);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  // Wait for layout then print
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 250);
}
