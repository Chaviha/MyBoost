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

/** Process / service keywords cutting companies use in product names. */
export const DXF_PROCESSES = [
  "Laser Cut",
  "Plasma Cut",
  "CNC Cut",
  "Waterjet Cut",
  "Router Cut",
  "DXF Cut",
  "Engraving",
  "Punching",
  "Pierce",
] as const;

export type DxfProcess = (typeof DXF_PROCESSES)[number];

export const DXF_MATERIALS = [
  "Mild Steel",
  "Stainless Steel",
  "Aluminium",
  "Brass",
  "Wood",
  "MDF",
  "Plywood",
  "Acrylic",
  "Perspex",
  "PVC",
] as const;

/** Common thicknesses (mm) offered in the quote dropdown. */
export const DXF_THICKNESSES_MM = [
  0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 25,
] as const;

/**
 * Built-in fallback rates used only when no cutting company has listed a matching
 * product. cutRate is KSh per mm of cut path; pierce is KSh per pierce/start.
 */
const FALLBACK_RATES: Record<string, { pierce: number; cutRate: number }> = {
  "mild steel": { pierce: 25, cutRate: 0.8 },
  "stainless steel": { pierce: 35, cutRate: 1.2 },
  aluminium: { pierce: 18, cutRate: 0.6 },
  brass: { pierce: 40, cutRate: 0.9 },
  wood: { pierce: 10, cutRate: 0.25 },
  mdf: { pierce: 8, cutRate: 0.2 },
  plywood: { pierce: 10, cutRate: 0.22 },
  acrylic: { pierce: 15, cutRate: 0.4 },
  perspex: { pierce: 15, cutRate: 0.4 },
  pvc: { pierce: 12, cutRate: 0.3 },
};

export type DxfRate = {
  pierceCost: number;
  /** Always normalised to KSh per mm of cut length. */
  cutRate: number;
  source: "catalog" | "fallback";
  product?: PriceableItem;
  pierceProduct?: PriceableItem;
  note?: string;
};

/**
 * How a cutting company lists prices in Catalogue → Products:
 *
 * Product name pattern:  `{Process} {Material} {Thickness}mm`
 * Examples:
 *   "Laser Cut Mild Steel 3mm"
 *   "Engraving Acrylic 5mm"
 *   "Punching Mild Steel 2mm"
 *   "CNC Cut Wood 12mm"
 *
 * Unit: "m" (KSh per metre of path) preferred, or "mm".
 * Optional pierce product: "Pierce Mild Steel" (unit: pierce).
 */
export function matchDxfRate(
  products: PriceableItem[],
  material: string,
  thickness: number,
  process?: string,
): DxfRate {
  const matTokens = material
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const processTokens = (process || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const thicknessToken = thickness ? `${thickness}mm` : null;
  const thicknessBare = thickness ? String(thickness) : null;

  const scoreOf = (p: PriceableItem) => {
    const hay = `${p.category} ${p.name}`.toLowerCase();
    let score = 0;
    for (const t of matTokens) if (hay.includes(t)) score += 2;
    for (const t of processTokens) if (hay.includes(t)) score += 3;
    if (thicknessToken && hay.includes(thicknessToken)) score += 4;
    else if (thicknessBare && hay.includes(thicknessBare)) score += 2;
    if (
      /laser|plasma|cnc|dxf|cut|router|waterjet|engrav|punch|pierce|cutting/i.test(
        hay,
      )
    ) {
      score += 1;
    }
    return score;
  };

  const serviceCandidates = products.filter((p) =>
    /dxf|cut|laser|plasma|cnc|router|waterjet|cutting|engrav|punch/i.test(
      `${p.category} ${p.name}`,
    ),
  );
  const pierceCandidates = products.filter((p) =>
    /pierce|piercing|start fee|lead.?in/i.test(`${p.category} ${p.name}`),
  );

  // Engraving / punching are rate products themselves (not pierce)
  const isEngraveOrPunch =
    process && /engrav|punch/i.test(process);

  const bestService = serviceCandidates
    .map((p) => ({ p, score: scoreOf(p) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)[0];
  const bestPierce = pierceCandidates
    .map((p) => ({ p, score: scoreOf(p) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (bestService) {
    const unit = (bestService.p.unit || "mm").toLowerCase();
    let cutRatePerMm = bestService.p.selling_price;
    let note = "";
    if (unit === "m" || unit === "metre" || unit === "meter" || unit === "lm") {
      cutRatePerMm = bestService.p.selling_price / 1000;
      note = `${bestService.p.selling_price}/m → ${cutRatePerMm}/mm`;
    } else if (unit === "cm") {
      cutRatePerMm = bestService.p.selling_price / 10;
      note = `${bestService.p.selling_price}/cm`;
    } else {
      note = `${bestService.p.selling_price}/${unit || "mm"}`;
    }
    return {
      cutRate: cutRatePerMm,
      pierceCost: isEngraveOrPunch ? 0 : bestPierce ? bestPierce.p.selling_price : 0,
      source: "catalog",
      product: bestService.p,
      pierceProduct: isEngraveOrPunch ? undefined : bestPierce?.p,
      note,
    };
  }

  const key = material.toLowerCase();
  const fallback =
    FALLBACK_RATES[key] ??
    (key.includes("steel")
      ? FALLBACK_RATES["mild steel"]
      : key.includes("acryl") || key.includes("perspex")
        ? FALLBACK_RATES.acrylic
        : key.includes("wood") || key.includes("mdf") || key.includes("ply")
          ? FALLBACK_RATES.wood
          : FALLBACK_RATES["mild steel"]);
  return {
    cutRate: fallback.cutRate,
    pierceCost: isEngraveOrPunch ? 0 : fallback.pierce,
    source: "fallback",
    note: "typical rate (no cutting company matched in catalogue)",
  };
}

export function dxfLineTotal(cutLenMm: number, pierces: number, rate: DxfRate, qty: number) {
  const cutCost = cutLenMm * rate.cutRate;
  const pierceCost = pierces * rate.pierceCost;
  return { cutCost, pierceCost, total: (cutCost + pierceCost) * qty };
}
