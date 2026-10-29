/**
 * Asset brochure — showcase only:
 * images, description, specs (status, location, video links),
 * address and contacts.
 * Built from asset records; does not print the app page.
 */

export type BrochureMedia = {
  url: string;
  name?: string;
  media_type?: "image" | "video" | string;
};

export type BrochureAsset = {
  name: string;
  type?: string;
  /** Description / notes */
  notes?: string;
  /** Cover image */
  image_url?: string;
  /** Gallery (images + videos) */
  gallery?: BrochureMedia[];
  /** Listing / availability status */
  status?: string;
  listed?: boolean;
  listing_type?: string;
  /** Address / location */
  location?: string;
  /** Contact phone */
  phone?: string;
  /** Optional extra contact / link fields */
  email?: string;
  contact_name?: string;
};

export type BrochureOwner = {
  name: string;
  phone?: string;
  email?: string;
  region?: string;
  business_name?: string;
};

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Turn relative upload paths into absolute URLs so images work in a new about:blank window. */
function absoluteUrl(url?: string): string {
  const u = (url || "").trim();
  if (!u) return "";
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  if (typeof window !== "undefined" && window.location?.origin) {
    if (u.startsWith("//")) return `${window.location.protocol}${u}`;
    if (u.startsWith("/")) return `${window.location.origin}${u}`;
    return `${window.location.origin}/${u.replace(/^\.\//, "")}`;
  }
  return u;
}

function collectImages(a: BrochureAsset): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (url?: string) => {
    const u = absoluteUrl(url);
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };
  push(a.image_url);
  for (const m of a.gallery || []) {
    if (m.media_type && m.media_type !== "image") continue;
    push(m.url);
  }
  return out;
}

function collectVideos(a: BrochureAsset): BrochureMedia[] {
  const out: BrochureMedia[] = [];
  const seen = new Set<string>();
  for (const m of a.gallery || []) {
    if (m.media_type !== "video") continue;
    const u = absoluteUrl(m.url);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push({ ...m, url: u });
  }
  return out;
}

function statusLabel(a: BrochureAsset): string {
  if (a.status) return a.status;
  if (a.listed) return a.listing_type || "Listed";
  return "Available";
}

function assetSectionHtml(a: BrochureAsset, index: number, total: number): string {
  const images = collectImages(a);
  const videos = collectVideos(a);
  const pageHint =
    total > 1 ? `<div class="asset-index">Item ${index + 1} of ${total}</div>` : "";

  const galleryHtml =
    images.length === 0
      ? `<div class="photo-placeholder"><span>${esc((a.type || a.name || "A").charAt(0).toUpperCase())}</span><p>No photo</p></div>`
      : images.length === 1
        ? `<div class="hero-photo"><img src="${esc(images[0])}" alt="${esc(a.name)}" /></div>`
        : `<div class="hero-photo"><img src="${esc(images[0])}" alt="${esc(a.name)}" /></div>
           <div class="thumb-row">
             ${images
               .slice(1, 8)
               .map(
                 (src, i) =>
                   `<div class="thumb"><img src="${esc(src)}" alt="${esc(a.name)} ${i + 2}" /></div>`,
               )
               .join("")}
           </div>`;

  const description = (a.notes || "").trim();
  const status = statusLabel(a);
  const location = (a.location || "").trim();
  const phone = (a.phone || "").trim();
  const email = (a.email || "").trim();
  const contactName = (a.contact_name || "").trim();

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

  const hasSpecs = Boolean(status || location || videos.length);
  const specsHtml = hasSpecs
    ? `<div class="block">
        <h3>Specifications</h3>
        <table class="specs"><tbody>
          ${status ? `<tr><th>Status</th><td>${esc(status)}</td></tr>` : ""}
          ${location ? `<tr><th>Location</th><td>${esc(location)}</td></tr>` : ""}
          ${
            videos.length
              ? `<tr><th>Videos</th><td>${videos.length} link${videos.length === 1 ? "" : "s"} (see below)</td></tr>`
              : ""
          }
        </tbody></table>
      </div>`
    : "";

  const hasContact = Boolean(location || phone || email || contactName);
  const contactHtml = hasContact
    ? `<div class="block contact">
        <h3>Address &amp; contacts</h3>
        ${location ? `<p class="addr"><span class="ico">📍</span> ${esc(location)}</p>` : ""}
        ${contactName ? `<p class="addr"><span class="ico">👤</span> ${esc(contactName)}</p>` : ""}
        ${phone ? `<p class="addr"><span class="ico">📞</span> <a href="tel:${esc(phone)}">${esc(phone)}</a></p>` : ""}
        ${email ? `<p class="addr"><span class="ico">✉️</span> <a href="mailto:${esc(email)}">${esc(email)}</a></p>` : ""}
      </div>`
    : "";

  return `
  <section class="asset-sheet">
    ${pageHint}
    <div class="asset-header">
      <div>
        ${a.type ? `<p class="eyebrow">${esc(a.type)}</p>` : ""}
        <h2>${esc(a.name)}</h2>
      </div>
    </div>

    <div class="asset-grid">
      <div class="photos">
        ${galleryHtml}
      </div>
      <div class="details">
        ${
          description
            ? `<div class="block">
                <h3>Description</h3>
                <p class="desc">${esc(description)}</p>
              </div>`
            : ""
        }
        ${specsHtml}
        ${videoLinks}
        ${contactHtml}
      </div>
    </div>
  </section>`;
}


/**
 * Fetch an image URL and return a data URL, or the absolute URL as fallback.
 * Same-origin uploads send cookies; cross-origin URLs (Cloudflare R2) must be
 * fetched WITHOUT credentials, because R2 CORS cannot answer credentialed requests.
 */
async function urlToDataUrl(url: string): Promise<string> {
  const abs = absoluteUrl(url);
  if (!abs) return "";
  if (/^data:/i.test(abs)) return abs;
  let sameOrigin = false;
  try {
    sameOrigin = new URL(abs).origin === window.location.origin;
  } catch {
    /* keep false */
  }
  const attempts: RequestCredentials[] = sameOrigin ? ["include", "omit"] : ["omit"];
  for (const credentials of attempts) {
    try {
      const res = await fetch(abs, { credentials, mode: "cors" });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) continue;
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || abs));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch {
      /* try next */
    }
  }
  return abs;
}

/** Inline all image URLs on assets so the brochure does not depend on relative paths. */
export async function prepareAssetsForBrochure(
  assets: BrochureAsset[],
): Promise<BrochureAsset[]> {
  return Promise.all(
    assets.map(async (a) => {
      const image_url = a.image_url ? await urlToDataUrl(a.image_url) : "";
      const gallery = await Promise.all(
        (a.gallery || []).map(async (m) => {
          if (m.media_type === "video") {
            return { ...m, url: absoluteUrl(m.url) };
          }
          const url = await urlToDataUrl(m.url);
          return { ...m, url };
        }),
      );
      return { ...a, image_url, gallery };
    }),
  );
}

export function buildAssetsBrochureHtml(
  owner: BrochureOwner,
  assets: BrochureAsset[],
  opts?: { title?: string; generatedAt?: Date },
): string {
  const title =
    opts?.title ||
    `${owner.business_name || owner.name || "Asset"} brochure`;
  const when = (opts?.generatedAt || new Date()).toLocaleString("en-KE");

  const body =
    assets.length === 0
      ? `<p class="empty">No assets selected for this brochure.</p>`
      : assets.map((a, i) => assetSectionHtml(a, i, assets.length)).join("");

  const ownerLine = [
    owner.business_name,
    owner.name ? `Prepared by ${owner.name}` : "",
    owner.phone,
    owner.email,
    owner.region,
  ]
    .filter(Boolean)
    .map(esc)
    .join(" · ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    :root {
      --ink: #12161f;
      --muted: #5a6475;
      --line: #e3e7ef;
      --paper: #f7f8fa;
      --card: #ffffff;
      --accent: #1f6b4a;
      --accent-soft: #e7f4ed;
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
    .page { max-width: 920px; margin: 0 auto; padding: 28px 24px 48px; }
    .cover {
      background: linear-gradient(135deg, #0c3224 0%, #1f6b4a 50%, #2a8a5e 100%);
      color: #fff;
      border-radius: 18px;
      padding: 28px 32px;
      margin-bottom: 28px;
    }
    .cover h1 { margin: 0 0 8px; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
    .cover .meta { opacity: 0.9; font-size: 12.5px; }
    .cover .count {
      margin-top: 14px;
      display: inline-block;
      background: rgba(255,255,255,0.14);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 10px;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 600;
    }
    .asset-sheet {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 22px 24px 26px;
      margin-bottom: 22px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .asset-index {
      font-size: 11px; color: var(--muted); margin-bottom: 8px;
      text-transform: uppercase; letter-spacing: .06em;
    }
    .asset-header {
      border-bottom: 1px solid var(--line);
      padding-bottom: 14px; margin-bottom: 16px;
    }
    .eyebrow {
      margin: 0 0 4px; font-size: 11px; font-weight: 700;
      letter-spacing: .12em; text-transform: uppercase; color: var(--accent);
    }
    .asset-header h2 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
    .asset-grid { display: grid; grid-template-columns: 1.05fr 1fr; gap: 20px; }
    @media (max-width: 720px) { .asset-grid { grid-template-columns: 1fr; } }
    .hero-photo {
      border-radius: 12px; overflow: hidden; background: #e8ecf2; aspect-ratio: 4 / 3;
    }
    .hero-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .thumb-row {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
      gap: 6px; margin-top: 8px;
    }
    .thumb { border-radius: 8px; overflow: hidden; aspect-ratio: 1; background: #e8ecf2; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .photo-placeholder {
      aspect-ratio: 4 / 3; border-radius: 12px;
      background: linear-gradient(145deg, #dce6e1, #eef3f0);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      color: var(--accent);
    }
    .photo-placeholder span { font-size: 48px; font-weight: 700; line-height: 1; }
    .photo-placeholder p { margin: 6px 0 0; font-size: 12px; color: var(--muted); }
    .block { margin-bottom: 14px; }
    .block h3 {
      margin: 0 0 8px; font-size: 12px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .08em; color: var(--muted);
    }
    .desc { margin: 0; white-space: pre-wrap; color: var(--ink); font-size: 13.5px; }
    table.specs { width: 100%; border-collapse: collapse; }
    table.specs th, table.specs td {
      border-bottom: 1px solid var(--line); padding: 7px 0;
      text-align: left; vertical-align: top;
    }
    table.specs th {
      width: 34%; color: var(--muted); font-weight: 600; font-size: 12px; padding-right: 10px;
    }
    table.specs td { font-weight: 500; }
    .addr { margin: 0 0 6px; color: var(--ink); }
    .addr .ico { margin-right: 4px; }
    .addr a { color: var(--accent); text-decoration: none; }
    .addr a:hover { text-decoration: underline; }
    ul.links { margin: 0; padding-left: 18px; }
    ul.links li { margin-bottom: 4px; }
    ul.links a { color: var(--accent); word-break: break-all; }
    footer.doc {
      margin-top: 8px; padding-top: 14px; border-top: 1px solid var(--line);
      color: var(--muted); font-size: 11px;
      display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px;
    }
    .empty { color: var(--muted); padding: 24px; text-align: center; }
    @media print {
      body { background: #fff; }
      .page { max-width: none; padding: 10mm; }
      .cover { break-after: avoid; }
      .asset-sheet { break-inside: avoid; page-break-inside: avoid; }
      .asset-sheet + .asset-sheet { page-break-before: always; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="cover">
      <h1>${esc(title)}</h1>
      <div class="meta">${ownerLine || "Asset brochure"}</div>
      <div class="count">${assets.length} item${assets.length === 1 ? "" : "s"}</div>
    </header>
    ${body}
    <footer class="doc">
      <span>Generated with LifeBoost · ${esc(when)}</span>
      <span>Images · Description · Specs · Address &amp; contacts</span>
    </footer>
  </div>
</body>
</html>`;
}

function openBrochureWindow(html: string): Window {
  const w = window.open("", "_blank", "noopener,noreferrer,width=980,height=720");
  if (!w) {
    throw new Error(
      "Pop-up blocked. Allow pop-ups for this site, or use Download brochure instead.",
    );
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  return w;
}

export async function printAssetsBrochure(
  owner: BrochureOwner,
  assets: BrochureAsset[],
  opts?: { title?: string },
): Promise<void> {
  const prepared = await prepareAssetsForBrochure(assets);
  const html = buildAssetsBrochureHtml(owner, prepared, opts);
  const w = openBrochureWindow(html);
  // Wait for inlined images to decode before print
  setTimeout(() => {
    w.focus();
    w.print();
  }, 500);
}

export async function downloadAssetsBrochureHtml(
  owner: BrochureOwner,
  assets: BrochureAsset[],
  opts?: { title?: string },
): Promise<void> {
  const prepared = await prepareAssetsForBrochure(assets);
  const html = buildAssetsBrochureHtml(owner, prepared, opts);
  const safe = (owner.business_name || owner.name || "assets").replace(/[^\w\-]+/g, "_");
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}-asset-brochure.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function shareAssetsBrochure(
  owner: BrochureOwner,
  assets: BrochureAsset[],
  opts?: { title?: string },
): Promise<"shared" | "downloaded"> {
  const prepared = await prepareAssetsForBrochure(assets);
  const html = buildAssetsBrochureHtml(owner, prepared, opts);
  const safe = (owner.business_name || owner.name || "assets").replace(/[^\w\-]+/g, "_");
  const file = new File([html], `${safe}-asset-brochure.html`, { type: "text/html" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: opts?.title || "Asset brochure",
      text: `Asset brochure · ${assets.length} item(s)`,
      files: [file],
    });
    return "shared";
  }
  if (navigator.share) {
    await navigator.share({
      title: opts?.title || "Asset brochure",
      text: `Asset brochure — ${assets.length} item(s).`,
    });
    return "shared";
  }
  downloadAssetsBrochureHtml(owner, assets, opts);
  return "downloaded";
}
