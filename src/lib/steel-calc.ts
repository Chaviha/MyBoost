/** Minimal shape needed to match a catalog rate — satisfied by both a business's
 * own `Product` and a cross-business `MarketplaceProduct` from the public feed. */
export type PriceableItem = {
  product_id: string;
  business_id: string;
  name: string;
  category: string;
  selling_price: number;
};

export type SteelCategory = "plates" | "rhs" | "shs" | "chs" | "shaft";

export const STEEL_CATEGORY_LABELS: Record<SteelCategory, string> = {
  plates: "Plate / Sheet",
  rhs: "RHS (Rectangular Hollow Section)",
  shs: "SHS (Square Hollow Section)",
  chs: "CHS (Circular Hollow Section)",
  shaft: "Round Shaft / Bar",
};

export const STEEL_GRADES: Record<SteelCategory, string[]> = {
  plates: ["MS (Mild Steel)", "GI (Galvanised Iron)", "SS 201", "SS 304", "Brass", "Copper", "CRCA", "Aluminium"],
  rhs: ["MS (Mild Steel)", "GI (Galvanised Iron)", "SS 201", "SS 304"],
  shs: ["MS (Mild Steel)", "GI (Galvanised Iron)", "SS 201", "SS 304"],
  chs: ["MS (Mild Steel)", "GI (Galvanised Iron)", "SS 201", "SS 304"],
  shaft: ["MS (Mild Steel)", "SS 304", "Brass", "Aluminium"],
};

export type SteelSpecField = { id: string; label: string };

export const STEEL_SPECS: Record<SteelCategory, SteelSpecField[]> = {
  plates: [
    { id: "length", label: "Length (mm)" },
    { id: "width", label: "Width (mm)" },
    { id: "thickness", label: "Thickness (mm)" },
  ],
  rhs: [
    { id: "breadth", label: "Breadth (mm)" },
    { id: "width", label: "Width (mm)" },
    { id: "thickness", label: "Thickness (mm)" },
    { id: "length", label: "Length (mm)" },
  ],
  shs: [
    { id: "breadth", label: "Breadth (mm)" },
    { id: "width", label: "Width (mm)" },
    { id: "thickness", label: "Thickness (mm)" },
    { id: "length", label: "Length (mm)" },
  ],
  chs: [
    { id: "od", label: "Outer dia (mm)" },
    { id: "thickness", label: "Thickness (mm)" },
    { id: "length", label: "Length (mm)" },
  ],
  shaft: [
    { id: "dia", label: "Diameter (mm)" },
    { id: "length", label: "Length (mm)" },
  ],
};

/** Approximate densities in kg/mm^3, keyed by lowercased grade keyword. */
const DENSITY: Record<string, number> = {
  ms: 7.85e-6,
  gi: 7.85e-6,
  crca: 7.85e-6,
  "ss 201": 7.9e-6,
  "ss 304": 8.0e-6,
  brass: 8.5e-6,
  copper: 8.96e-6,
  aluminium: 2.7e-6,
};

function densityFor(grade: string): number {
  const g = grade.toLowerCase();
  for (const key of Object.keys(DENSITY)) {
    if (g.includes(key)) return DENSITY[key];
  }
  return 7.85e-6; // default to mild steel
}

/** Weight in kg for a single piece, given category/grade/dims in mm. */
export function steelWeightKg(
  category: SteelCategory,
  grade: string,
  dims: Record<string, number>,
): number {
  const d = densityFor(grade);
  switch (category) {
    case "plates": {
      const { length = 0, width = 0, thickness = 0 } = dims;
      return length * width * thickness * d;
    }
    case "rhs":
    case "shs": {
      const { breadth = 0, width = 0, thickness = 0, length = 0 } = dims;
      // kg/mm run-length = 2*T*(B+W-2T)*density ; total = run-length * length(mm)
      const perMm = 2 * thickness * (breadth + width - 2 * thickness) * d;
      return Math.max(0, perMm) * length;
    }
    case "chs": {
      const { od = 0, thickness = 0, length = 0 } = dims;
      const perMm = Math.PI * thickness * (od - thickness) * d;
      return Math.max(0, perMm) * length;
    }
    case "shaft": {
      const { dia = 0, length = 0 } = dims;
      const perMm = (Math.PI / 4) * dia * dia * d;
      return perMm * length;
    }
    default:
      return 0;
  }
}

export type MatchedRate = {
  product: PriceableItem;
  score: number;
};

/**
 * Find the best-matching product in a business's catalog for a steel line item,
 * by scoring name/category text against the category, grade, and key dimension.
 * Convention: products are named/categorised like "MS Plate 3mm", "SS 304 RHS 40x40x3mm".
 */
export function matchSteelProduct(
  products: PriceableItem[],
  category: SteelCategory,
  grade: string,
  dims: Record<string, number>,
): MatchedRate | null {
  const catTokens = STEEL_CATEGORY_LABELS[category]
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .concat(category);
  const gradeTokens = grade
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const thicknessToken = dims.thickness ? `${dims.thickness}mm` : null;

  let best: MatchedRate | null = null;
  for (const p of products) {
    const hay = `${p.category} ${p.name}`.toLowerCase();
    let score = 0;
    if (catTokens.some((t) => hay.includes(t))) score += 2;
    for (const t of gradeTokens) if (hay.includes(t)) score += 1;
    if (thicknessToken && hay.includes(thicknessToken)) score += 3;
    if (score > 0 && (!best || score > best.score)) best = { product: p, score };
  }
  return best;
}

/** Line total (KSh) for a steel item: weight(kg) x qty x rate/kg. */
export function steelLineTotal(weightKg: number, qty: number, ratePerKg: number): number {
  return weightKg * qty * ratePerKg;
}

/**
 * Find a labour rate (KSh/kg) for a given grade + thickness, from products a
 * fabricator has listed for their own labour (convention: category/name containing
 * "labour"/"rolling"/"fabrication", e.g. "Rolling Labour MS 3mm"). Labour is priced
 * per kg so it scales the same way material does — by weight, thickness and
 * material type — rather than as a flat fee.
 */
export function matchLabourRate(
  products: PriceableItem[],
  grade: string,
  thicknessMm: number,
): MatchedRate | null {
  const candidates = products.filter((p) => /labour|labor|rolling|fabrication/i.test(`${p.category} ${p.name}`));
  const gradeTokens = grade.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const thicknessToken = thicknessMm ? `${thicknessMm}mm` : null;

  let best: MatchedRate | null = null;
  for (const p of candidates) {
    const hay = `${p.category} ${p.name}`.toLowerCase();
    let score = 1; // already passed the labour/rolling filter
    for (const t of gradeTokens) if (hay.includes(t)) score += 1;
    if (thicknessToken && hay.includes(thicknessToken)) score += 3;
    if (!best || score > best.score) best = { product: p, score };
  }
  return best;
}

/** Labour cost (KSh): weight(kg) x qty x labour rate/kg. Same shape as material pricing. */
export function labourLineTotal(weightKg: number, qty: number, ratePerKg: number): number {
  return weightKg * qty * ratePerKg;
}

/**
 * Length of straight bar (mm) consumed rolling it into a ring/hoop of the given
 * diameter — e.g. a client asking for a rolled 50x50x2mm RHS ring of 400mm diameter
 * only needs π×D of material, not a full 6m stock length. `overlapMm` covers the
 * small extra length fabricators leave for the closing weld join (defaults to 50mm).
 */
export function rolledLength(diameterMm: number, overlapMm = 50): number {
  return Math.max(0, Math.PI * diameterMm + overlapMm);
}
