import type { PriceableItem } from "@/lib/steel-calc";

export type DxfParsed = { totalLen: number; pierces: number; entities: number };

type Entity = { length: number; pierces: number } | null;

/** Parse raw DXF text into total cut length (mm) and pierce (entity start) count. */
export function parseDXF(text: string): DxfParsed {
  const lines = text.split(/\r?\n/);
  let totalLen = 0;
  let pierces = 0;
  let entities = 0;
  let i = 0;

  while (i < lines.length - 1) {
    const code = lines[i]?.trim();
    const val = lines[i + 1]?.trim()?.toUpperCase();

    if (code === "0") {
      let ent: Entity = null;
      if (val === "LWPOLYLINE") ent = readLWPolyline(lines, i);
      else if (val === "SPLINE") ent = readSpline(lines, i);
      else if (val === "LINE" || val === "ARC" || val === "CIRCLE" || val === "ELLIPSE") {
        ent = readEntity(lines, i, val);
      }
      if (ent) {
        totalLen += ent.length;
        pierces += ent.pierces;
        entities++;
      }
    }
    i += 2;
  }

  return { totalLen, pierces, entities };
}

function readEntity(lines: string[], start: number, type: string): Entity {
  const p: Record<number, number> = {};
  let i = start + 2;
  while (i < lines.length - 1) {
    const c = parseInt(lines[i]?.trim() ?? "", 10);
    const v = parseFloat(lines[i + 1]?.trim() ?? "");
    if (c === 0 && i > start + 2) break;
    if (!Number.isNaN(c)) p[c] = v;
    i += 2;
  }
  try {
    if (type === "LINE") {
      const dx = (p[11] || 0) - (p[10] || 0);
      const dy = (p[21] || 0) - (p[20] || 0);
      return { length: Math.sqrt(dx * dx + dy * dy), pierces: 1 };
    }
    if (type === "ARC") {
      const r = p[40] || 1;
      const sa = ((p[50] || 0) * Math.PI) / 180;
      let ea = ((p[51] || 360) * Math.PI) / 180;
      if (ea <= sa) ea += 2 * Math.PI;
      return { length: r * (ea - sa), pierces: 1 };
    }
    if (type === "CIRCLE") {
      return { length: 2 * Math.PI * (p[40] || 1), pierces: 1 };
    }
    if (type === "ELLIPSE") {
      const a = p[40] || 1;
      const b = (p[41] || 0.5) * a;
      return { length: Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))), pierces: 1 };
    }
  } catch {
    // fall through
  }
  return null;
}

function readLWPolyline(lines: string[], start: number): Entity {
  let i = start + 2;
  const xs: number[] = [];
  const ys: number[] = [];
  const bulges: number[] = [];
  let closed = false;

  while (i < lines.length - 1) {
    const code = parseInt(lines[i]?.trim() ?? "", 10);
    const raw = lines[i + 1]?.trim() ?? "";
    if (code === 0 && i > start + 2) break;
    if (code === 70) closed = (parseInt(raw, 10) & 1) === 1;
    if (code === 10) xs.push(parseFloat(raw));
    if (code === 20) ys.push(parseFloat(raw));
    if (code === 42) bulges[xs.length - 1] = parseFloat(raw);
    i += 2;
  }
  for (let j = 0; j < xs.length; j++) if (bulges[j] === undefined) bulges[j] = 0;

  let length = 0;
  const n = xs.length;
  const limit = closed ? n : n - 1;
  for (let j = 0; j < limit; j++) {
    const x1 = xs[j];
    const y1 = ys[j];
    const x2 = xs[(j + 1) % n];
    const y2 = ys[(j + 1) % n];
    const b = bulges[j] || 0;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const chord = Math.sqrt(dx * dx + dy * dy);
    if (b === 0 || chord < 1e-10) {
      length += chord;
    } else {
      const r = (chord * (1 + b * b)) / (4 * Math.abs(b));
      const theta = 4 * Math.atan(Math.abs(b));
      length += r * theta;
    }
  }
  return { length, pierces: 1 };
}

function readSpline(lines: string[], start: number): Entity {
  let i = start + 2;
  const xs: number[] = [];
  const ys: number[] = [];
  let degree = 3;
  let closed = false;
  while (i < lines.length - 1) {
    const code = parseInt(lines[i]?.trim() ?? "", 10);
    const raw = lines[i + 1]?.trim() ?? "";
    if (code === 0 && i > start + 2) break;
    if (code === 71) degree = parseInt(raw, 10) || 3;
    if (code === 70) closed = (parseInt(raw, 10) & 1) === 1;
    if (code === 10) xs.push(parseFloat(raw));
    if (code === 20) ys.push(parseFloat(raw));
    i += 2;
  }
  if (xs.length < 2) return null;
  if (degree === 3 && xs.length >= 4) return { length: sampleBezierChain(xs, ys, closed), pierces: 1 };

  let length = 0;
  const n = xs.length;
  const limit = closed ? n : n - 1;
  for (let j = 0; j < limit; j++) {
    const dx = xs[(j + 1) % n] - xs[j];
    const dy = ys[(j + 1) % n] - ys[j];
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return { length, pierces: 1 };
}

function sampleBezierChain(xs: number[], ys: number[], closed: boolean): number {
  const SAMPLES = 16;
  let total = 0;
  const n = xs.length;
  const step = 3;
  const limit = closed ? n : n - step;
  for (let start = 0; start < limit; start += step) {
    const p = [0, 1, 2, 3].map((k) => ({ x: xs[(start + k) % n], y: ys[(start + k) % n] }));
    let prevX = p[0].x;
    let prevY = p[0].y;
    for (let s = 1; s <= SAMPLES; s++) {
      const t = s / SAMPLES;
      const t2 = t * t;
      const t3 = t2 * t;
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;
      const bx = mt3 * p[0].x + 3 * mt2 * t * p[1].x + 3 * mt * t2 * p[2].x + t3 * p[3].x;
      const by = mt3 * p[0].y + 3 * mt2 * t * p[1].y + 3 * mt * t2 * p[2].y + t3 * p[3].y;
      const dx = bx - prevX;
      const dy = by - prevY;
      total += Math.sqrt(dx * dx + dy * dy);
      prevX = bx;
      prevY = by;
    }
  }
  return total;
}

export const DXF_MATERIALS = ["Mild Steel", "Stainless Steel", "Aluminium", "Brass"];

/** Built-in fallback rates (KSh) used only when the pricing business has no matching catalog product. */
const FALLBACK_RATES: Record<string, { pierce: number; cutRate: number }> = {
  "mild steel": { pierce: 25, cutRate: 0.0008 },
  "stainless steel": { pierce: 35, cutRate: 0.001 },
  aluminium: { pierce: 18, cutRate: 0.0006 },
  brass: { pierce: 40, cutRate: 0.0009 },
};

export type DxfRate = { pierceCost: number; cutRate: number; source: "catalog" | "fallback"; product?: PriceableItem };

/**
 * Find cut-rate (KSh/mm) and pierce-cost (KSh/pierce) for a material+thickness from
 * the pricing business's catalog. Convention: a product named/categorised like
 * "DXF Cut Mild Steel 3mm" supplies the per-mm cut rate, and an optional product
 * named like "DXF Pierce Mild Steel" supplies the per-pierce cost. Falls back to
 * built-in industry-typical rates if nothing matches, so the calculator still works
 * before a business has set up its DXF pricing.
 */
export function matchDxfRate(products: PriceableItem[], material: string, thickness: number): DxfRate {
  const matTokens = material.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const thicknessToken = thickness ? `${thickness}mm` : null;

  const scoreOf = (p: PriceableItem) => {
    const hay = `${p.category} ${p.name}`.toLowerCase();
    let score = 0;
    for (const t of matTokens) if (hay.includes(t)) score += 1;
    if (thicknessToken && hay.includes(thicknessToken)) score += 3;
    return score;
  };

  const cutCandidates = products.filter((p) => /dxf|cut/i.test(`${p.category} ${p.name}`));
  const pierceCandidates = products.filter((p) => /pierce/i.test(`${p.category} ${p.name}`));

  const bestCut = cutCandidates
    .map((p) => ({ p, score: scoreOf(p) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)[0];
  const bestPierce = pierceCandidates
    .map((p) => ({ p, score: scoreOf(p) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (bestCut) {
    return {
      cutRate: bestCut.p.selling_price,
      pierceCost: bestPierce ? bestPierce.p.selling_price : 0,
      source: "catalog",
      product: bestCut.p,
    };
  }

  const fallback = FALLBACK_RATES[material.toLowerCase()] ?? FALLBACK_RATES["mild steel"];
  return { cutRate: fallback.cutRate, pierceCost: fallback.pierce, source: "fallback" };
}

export function dxfLineTotal(cutLenMm: number, pierces: number, rate: DxfRate, qty: number) {
  const cutCost = cutLenMm * rate.cutRate;
  const pierceCost = pierces * rate.pierceCost;
  return { cutCost, pierceCost, total: (cutCost + pierceCost) * qty };
}
