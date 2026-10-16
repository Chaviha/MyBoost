/**
 * Page brochures — products, services, businesses, assets.
 * Fixes broken images by:
 * 1) Setting <base href> to the app origin (so /uploads/... resolves)
 * 2) Rewriting every media URL to an absolute URL
 * 3) Optionally inlining images as data URLs (for offline download)
 */

export type BrochureMedia = {
  url: string;
  name?: string;
  media_type?: "image" | "video" | string;
};

export type BrochureItem = {
  name: string;
  type?: string;
  description?: string;
  image_url?: string;
  gallery?: BrochureMedia[];
  specs?: Record<string, string | number>;
  location?: string;
  phone?: string;
  email?: string;
  contact_name?: string;
};

export type BrochureMeta = {
  title?: string;
  preparedBy?: string;
  phone?: string;
  email?: string;
};

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** App origin — where Vite proxies /uploads → API in dev. */
function appOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

/**
 * Resolve media URL to something loadable in a brochure window.
 * Handles: data:, blob:, http(s):, //cdn, /uploads/..., uploads/...
 */
export function resolveMediaUrl(url?: string): string {
  const u = (url || "").trim();
  if (!u) return "";
  if (/^data:/i.test(u)) return u;
  if (/^blob:/i.test(u)) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("//")) {
    return `${typeof window !== "undefined" ? window.location.protocol : "https:"}${u}`;
  }
  const origin = appOrigin();
  if (!origin) return u;
  if (u.startsWith("/")) return `${origin}${u}`;
  // bare path e.g. uploads/products/...
  return `${origin}/${u.replace(/^\.\//, "")}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

async function tryInlineImage(url: string): Promise<string> {
  const abs = resolveMediaUrl(url);
  if (!abs) return "";
  if (/^data:image\//i.test(abs)) return abs;

  // Prefer fetch against app origin (uses Vite /uploads proxy in dev)
  for (const creds of ["include", "omit"] as const) {
    try {
      const res = await fetch(abs, {
        credentials: creds,
        mode: "cors",
        cache: "force-cache",
      });
      if (!res.ok) continue;
      const blob = await res.blob();
      const type = blob.type || "";
      // Reject HTML error pages mistaken for images
      if (type.includes("text/html") || type.includes("application/json")) continue;
      if (blob.size < 32) continue;
      if (type.startsWith("image/") || type === "" || type === "application/octet-stream") {
        const data = await blobToDataUrl(
          type.startsWith("image/")
            ? blob
            : new Blob([blob], { type: "image/jpeg" }),
        );
        if (data.startsWith("data:")) return data;
      }
    } catch {
      /* next */
    }
  }

  // Canvas fallback (needs CORS on the image response)
  try {
    const data = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth || img.width;
          c.height = img.naturalHeight || img.height;
          if (!c.width || !c.height) {
            reject(new Error("empty"));
            return;
          }
          const ctx = c.getContext("2d");
          if (!ctx) {
            reject(new Error("no ctx"));
            return;
          }
          ctx.drawImage(img, 0, 0);
          resolve(c.toDataURL("image/jpeg", 0.9));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error("img error"));
      img.src = abs;
    });
    if (data.startsWith("data:")) return data;
  } catch {
    /* use absolute */
  }

  return abs;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

export type PrepareOptions = {
  /** When true, embed images as data URLs (better for offline HTML). Default true. */
  inlineImages?: boolean;
};

/** Rewrite all item media to absolute (and optionally data:) URLs. */
export async function prepareItemsForBrochure(
  items: BrochureItem[],
  opts?: PrepareOptions,
): Promise<BrochureItem[]> {
  const inline = opts?.inlineImages !== false;

  return mapPool(items, 2, async (item) => {
    const fixUrl = async (url?: string, isVideo?: boolean) => {
      if (!url) return "";
      if (isVideo) return resolveMediaUrl(url);
      return inline ? tryInlineImage(url) : resolveMediaUrl(url);
    };

    const galleryIn = Array.isArray(item.gallery) ? item.gallery : [];
    const gallery = await mapPool(galleryIn, 2, async (m) => {
      const video =
        m.media_type === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(m.url || "");
      return {
        ...m,
        url: await fixUrl(m.url, video),
        media_type: video ? "video" : m.media_type || "image",
      };
    });

    let image_url = await fixUrl(item.image_url, false);
    if (!image_url) {
      const first = gallery.find(
        (g) => g.media_type !== "video" && g.url && !/\.(mp4|webm|mov)/i.test(g.url),
      );
      if (first) image_url = first.url;
    }

    return { ...item, image_url, gallery };
  });
}

function collectImages(item: BrochureItem): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (url?: string) => {
    const u = (url || "").trim();
    if (!u || seen.has(u)) return;
    if (/\.(mp4|webm|mov)(\?|$)/i.test(u) && !u.startsWith("data:image")) return;
    seen.add(u);
    out.push(u);
  };
  push(item.image_url);
  for (const m of item.gallery || []) {
    if (m.media_type === "video") continue;
    push(m.url);
  }
  return out;
}

function collectVideos(item: BrochureItem): BrochureMedia[] {
  const out: BrochureMedia[] = [];
  const seen = new Set<string>();
  for (const m of item.gallery || []) {
    const video =
      m.media_type === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(m.url || "");
    if (!video) continue;
    const u = resolveMediaUrl(m.url);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push({ ...m, url: u });
  }
  return out;
}

function itemSectionHtml(item: BrochureItem, index: number, total: number): string {
  const images = collectImages(item);
  const videos = collectVideos(item);
  const pageHint =
    total > 1 ? `<div class="item-index">Page ${index + 1} of ${total}</div>` : "";

  // Do not HTML-escape data URLs / absolute URLs beyond attribute safety for quotes
  const srcAttr = (src: string) => esc(src);

  const galleryHtml =
    images.length === 0
      ? `<div class="photo-placeholder"><span>${esc((item.type || item.name || "·").charAt(0).toUpperCase())}</span><p>No photo</p></div>`
      : images.length === 1
        ? `<div class="hero-photo"><img src="${srcAttr(images[0])}" alt="${esc(item.name)}" /></div>`
        : `<div class="hero-photo"><img src="${srcAttr(images[0])}" alt="${esc(item.name)}" /></div>
           <div class="thumb-row">
             ${images
               .slice(1, 8)
               .map(
                 (src, i) =>
                   `<div class="thumb"><img src="${srcAttr(src)}" alt="${esc(item.name)} ${i + 2}" /></div>`,
               )
               .join("")}
           </div>`;

  const description = (item.description || "").trim();
  const specEntries: [string, string][] = [];
  if (item.specs) {
    for (const [k, v] of Object.entries(item.specs)) {
      if (v === "" || v == null) continue;
      specEntries.push([k.replace(/_/g, " "), String(v)]);
    }
  }
  if (videos.length) {
    specEntries.push([
      "Videos",
      `${videos.length} link${videos.length === 1 ? "" : "s"}`,
    ]);
  }

  const specsHtml =
    specEntries.length === 0
      ? ""
      : `<div class="block">
          <h3>Specifications</h3>
          <table class="specs"><tbody>
            ${specEntries
              .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
              .join("")}
          </tbody></table>
        </div>`;

  const videoLinks =
    videos.length === 0
      ? ""
      : `<div class="block">
          <h3>Video links</h3>
          <ul class="links">
            ${videos
              .map((v, i) => {
                const label = v.name || `Video ${i + 1}`;
                return `<li><a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a></li>`;
              })
              .join("")}
          </ul>
        </div>`;

  const location = (item.location || "").trim();
  const phone = (item.phone || "").trim();
  const email = (item.email || "").trim();
  const contactName = (item.contact_name || "").trim();
  const hasContact = Boolean(location || phone || email || contactName);
  const contactHtml = hasContact
    ? `<div class="block contact">
        <h3>Address &amp; contacts</h3>
        ${location ? `<p class="addr">📍 ${esc(location)}</p>` : ""}
        ${contactName ? `<p class="addr">👤 ${esc(contactName)}</p>` : ""}
        ${phone ? `<p class="addr">📞 <a href="tel:${esc(phone)}">${esc(phone)}</a></p>` : ""}
        ${email ? `<p class="addr">✉️ <a href="mailto:${esc(email)}">${esc(email)}</a></p>` : ""}
      </div>`
    : "";

  return `
  <section class="item-sheet">
    ${pageHint}
    <div class="item-title">
      ${item.type ? `<p class="eyebrow">${esc(item.type)}</p>` : ""}
      <h2>${esc(item.name)}</h2>
    </div>
    <div class="item-grid">
      <div class="photos">${galleryHtml}</div>
      <div class="details">
        ${
          description
            ? `<div class="block"><h3>Description</h3><p class="desc">${esc(description)}</p></div>`
            : ""
        }
        ${specsHtml}
        ${videoLinks}
        ${contactHtml}
      </div>
    </div>
  </section>`;
}

export function buildPageBrochureHtml(
  items: BrochureItem[],
  meta?: BrochureMeta,
): string {
  const title = meta?.title || "Brochure";
  const when = new Date().toLocaleString("en-KE");
  const origin = appOrigin() || "";
  const body =
    items.length === 0
      ? `<p class="empty">No items to include.</p>`
      : items.map((it, i) => itemSectionHtml(it, i, items.length)).join("");

  const sub = [meta?.preparedBy, meta?.phone, meta?.email]
    .filter(Boolean)
    .map(esc)
    .join(" · ");

  // <base> makes any leftover relative /uploads/... paths resolve against the app
  const baseTag = origin
    ? `<base href="${esc(origin.endsWith("/") ? origin : origin + "/")}" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${baseTag}
  <title>${esc(title)}</title>
  <style>
    :root {
      --ink: #12161f;
      --muted: #5a6475;
      --line: #e3e7ef;
      --paper: #ffffff;
      --accent: #1f6b4a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      color: var(--ink);
      background: var(--paper);
      font-size: 13.5px;
      line-height: 1.45;
    }
    .page { max-width: 900px; margin: 0 auto; padding: 24px 20px 40px; }
    .doc-title { margin: 0 0 4px; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .doc-sub { margin: 0 0 20px; font-size: 12px; color: var(--muted); }
    .item-sheet {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 20px 22px 24px;
      margin-bottom: 20px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .item-index {
      font-size: 11px; color: var(--muted); margin-bottom: 6px;
      text-transform: uppercase; letter-spacing: .06em;
    }
    .item-title { margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
    .eyebrow {
      margin: 0 0 4px; font-size: 11px; font-weight: 700;
      letter-spacing: .1em; text-transform: uppercase; color: var(--accent);
    }
    .item-title h2 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .item-grid { display: grid; grid-template-columns: 1.05fr 1fr; gap: 18px; }
    @media (max-width: 700px) { .item-grid { grid-template-columns: 1fr; } }
    .hero-photo {
      border-radius: 10px; overflow: hidden; background: #eef1f5; aspect-ratio: 4/3;
    }
    .hero-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .thumb-row {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
      gap: 6px; margin-top: 8px;
    }
    .thumb { border-radius: 6px; overflow: hidden; aspect-ratio: 1; background: #eef1f5; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .photo-placeholder {
      aspect-ratio: 4/3; border-radius: 10px; background: #eef1f5;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-size: 40px; font-weight: 700; color: var(--accent);
    }
    .photo-placeholder p { margin: 6px 0 0; font-size: 12px; font-weight: 500; color: var(--muted); }
    .block { margin-bottom: 12px; }
    .block h3 {
      margin: 0 0 6px; font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .08em; color: var(--muted);
    }
    .desc { margin: 0; white-space: pre-wrap; }
    table.specs { width: 100%; border-collapse: collapse; }
    table.specs th, table.specs td {
      border-bottom: 1px solid var(--line); padding: 6px 0;
      text-align: left; vertical-align: top;
    }
    table.specs th { width: 36%; color: var(--muted); font-weight: 600; font-size: 12px; padding-right: 8px; }
    .addr { margin: 0 0 4px; }
    .addr a { color: var(--accent); text-decoration: none; }
    ul.links { margin: 0; padding-left: 18px; }
    ul.links a { color: var(--accent); word-break: break-all; }
    .empty { color: var(--muted); text-align: center; padding: 24px; }
    footer.slim {
      margin-top: 8px; padding-top: 10px; border-top: 1px solid var(--line);
      font-size: 10px; color: var(--muted);
    }
    @media print {
      .page { max-width: none; padding: 8mm; }
      .item-sheet { break-inside: avoid; page-break-inside: avoid; }
      .item-sheet + .item-sheet { page-break-before: always; }
    }
  </style>
</head>
<body>
  <div class="page">
    <p class="doc-title">${esc(title)}</p>
    ${sub ? `<p class="doc-sub">${sub}</p>` : `<p class="doc-sub">${items.length} item${items.length === 1 ? "" : "s"}</p>`}
    ${body}
    <footer class="slim">${esc(when)}</footer>
  </div>
</body>
</html>`;
}

function openWindow(html: string): Window {
  // Do NOT use noopener — some browsers then isolate the window and break cookie/proxy image loads
  const w = window.open("about:blank", "_blank", "width=980,height=720");
  if (!w) {
    throw new Error("Pop-up blocked. Allow pop-ups or use Download instead.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  return w;
}

export async function printPageBrochure(
  items: BrochureItem[],
  meta?: BrochureMeta,
): Promise<void> {
  // Absolute URLs + <base> are enough for print; still try inline for reliability
  const prepared = await prepareItemsForBrochure(items, { inlineImages: true });
  const html = buildPageBrochureHtml(prepared, meta);
  const w = openWindow(html);
  setTimeout(() => {
    w.focus();
    w.print();
  }, 700);
}

export async function downloadPageBrochure(
  items: BrochureItem[],
  meta?: BrochureMeta,
): Promise<void> {
  const prepared = await prepareItemsForBrochure(items, { inlineImages: true });
  const html = buildPageBrochureHtml(prepared, meta);
  const safe = (meta?.title || "brochure").replace(/[^\w\-]+/g, "_");
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
