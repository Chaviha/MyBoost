/** Minimal shape needed to match a catalog rate — satisfied by both a business's
 * own `Product` and a cross-business `MarketplaceProduct` from the public feed. */
export type PriceableItem = {
  product_id: string;
  business_id: string;
  name: string;
  category: string;
  selling_price: number;
  unit?: string;
  /** Optional structured specs from catalogue (thickness, OD, mass_kg_m, …). */
  specs?: Record<string, string | number>;
};

export type SteelCategory = "plates" | "rhs" | "shs" | "chs" | "shaft" | "cement";

export const STEEL_CATEGORY_LABELS: Record<SteelCategory, string> = {
  plates: "Plate / Sheet",
  rhs: "RHS (Rectangular Hollow Section)",
  shs: "SHS (Square Hollow Section)",
  chs: "CHS (Circular Hollow Section)",
  shaft: "Round Shaft / Bar",
  cement: "Cement / bagged materials",
};

export const STEEL_GRADES: Record<SteelCategory, string[]> = {
  plates: ["MS (Mild Steel)", "GI (Galvanised Iron)", "SS 201", "SS 304", "Brass", "Copper", "CRCA", "Aluminium"],
  rhs: ["MS (Mild Steel)", "GI (Galvanised Iron)", "SS 201", "SS 304"],
  shs: ["MS (Mild Steel)", "GI (Galvanised Iron)", "SS 201", "SS 304"],
  chs: ["MS (Mild Steel)", "GI (Galvanised Iron)", "SS 201", "SS 304", "Class A", "Class B", "Class C"],
  shaft: ["MS (Mild Steel)", "SS 304", "Brass", "Aluminium"],
  cement: ["OPC 42.5", "OPC 32.5", "PLC", "General purpose"],
};

export type SteelSpecField = { id: string; label: string };

export const STEEL_SPECS: Record<SteelCategory, SteelSpecField[]> = {
  plates: [
    { id: "length", label: "Cut length (mm)" },
    { id: "width", label: "Cut width (mm)" },
    { id: "thickness", label: "Thickness (mm)" },
  ],
  rhs: [
    { id: "breadth", label: "Breadth (mm)" },
    { id: "width", label: "Width (mm)" },
    { id: "thickness", label: "Thickness (mm)" },
    { id: "length", label: "Cut length (mm)" },
  ],
  shs: [
    { id: "breadth", label: "Breadth (mm)" },
    { id: "width", label: "Width (mm)" },
    { id: "thickness", label: "Thickness (mm)" },
    { id: "length", label: "Cut length (mm)" },
  ],
  chs: [
    { id: "od", label: "Outer dia (mm)" },
    { id: "thickness", label: "Wall thickness (mm)" },
    { id: "length", label: "Cut length (mm)" },
  ],
  shaft: [
    { id: "dia", label: "Diameter (mm)" },
    { id: "length", label: "Cut length (mm)" },
  ],
  cement: [
    { id: "bags", label: "Bags needed" },
    { id: "pack_kg", label: "Bag size (kg)" },
  ],
};

/** Common stock plate sizes available from mills / yards (mm). */
export const STOCK_PLATE_SIZES: { label: string; width: number; length: number }[] = [
  { label: "1220 × 2440 (4×8 ft)", width: 1220, length: 2440 },
  { label: "1500 × 3000", width: 1500, length: 3000 },
  { label: "1250 × 2500", width: 1250, length: 2500 },
  { label: "1000 × 2000", width: 1000, length: 2000 },
];

/** Typical stock bar / pipe length (mm). */
export const STOCK_BAR_LENGTH_MM = 6000;

/** Approximate densities in kg/mm³, keyed by lowercased grade keyword. */
const DENSITY: Record<string, number> = {
  ms: 7.85e-6,
  gi: 7.85e-6,
  crca: 7.85e-6,
  "ss 201": 7.9e-6,
  "ss 304": 8.0e-6,
  brass: 8.5e-6,
  copper: 8.96e-6,
  aluminium: 2.7e-6,
  "class a": 7.85e-6,
  "class b": 7.85e-6,
  "class c": 7.85e-6,
};

export function densityFor(grade: string): number {
  const g = grade.toLowerCase();
  for (const key of Object.keys(DENSITY)) {
    if (g.includes(key)) return DENSITY[key];
  }
  return 7.85e-6;
}

/** Weight in kg for a single cut piece (theoretical density formula). */
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
      // Cross-section ≈ 2·t·(B + W − 2t); mass = section × length × density
      const perMm = 2 * thickness * (breadth + width - 2 * thickness) * d;
      return Math.max(0, perMm) * length;
    }
    case "chs": {
      const { od = 0, thickness = 0, length = 0 } = dims;
      // π · t · (OD − t) · density per mm of length
      const perMm = Math.PI * thickness * (od - thickness) * d;
      return Math.max(0, perMm) * length;
    }
    case "shaft": {
      const { dia = 0, length = 0 } = dims;
      const perMm = (Math.PI / 4) * dia * dia * d;
      return perMm * length;
    }
    case "cement": {
      const bags = dims.bags || 0;
      const pack = dims.pack_kg || 50;
      return bags * pack; // total kg of cement
    }
    default:
      return 0;
  }
}

/**
 * Mass per metre (kg/m) for sections — useful when catalogue has mass_kg_m
 * or when quoting per linear metre.
 */
export function massPerMetreKg(
  category: SteelCategory,
  grade: string,
  dims: Record<string, number>,
  catalogKgPerM?: number,
): number {
  if (catalogKgPerM && catalogKgPerM > 0) return catalogKgPerM;
  const d = densityFor(grade);
  switch (category) {
    case "rhs":
    case "shs": {
      const { breadth = 0, width = 0, thickness = 0 } = dims;
      // per mm run × 1000 mm = kg/m
      return Math.max(0, 2 * thickness * (breadth + width - 2 * thickness) * d * 1000);
    }
    case "chs": {
      const { od = 0, thickness = 0 } = dims;
      return Math.max(0, Math.PI * thickness * (od - thickness) * d * 1000);
    }
    case "shaft": {
      const { dia = 0 } = dims;
      return (Math.PI / 4) * dia * dia * d * 1000;
    }
    default:
      return 0;
  }
}

// ── Stock nesting ──────────────────────────────────────────────────────────

export type PlateNestResult = {
  stockWidth: number;
  stockLength: number;
  stockLabel: string;
  pieceWidth: number;
  pieceLength: number;
  piecesPerSheet: number;
  orientation: "as-cut" | "rotated";
  sheetsNeeded: number;
  totalPieces: number;
  /** Theoretical weight of one full stock sheet (kg). */
  sheetWeightKg: number;
  /** Weight of one cut piece (kg). */
  pieceWeightKg: number;
  /** Material kg charged when billing by sheets consumed. */
  chargedWeightSheetsKg: number;
  /** Material kg charged when billing by cut pieces only. */
  chargedWeightCutKg: number;
  utilization: number; // 0–1
};

/** How many axis-aligned pieces fit on one stock sheet (tries both orientations). */
export function piecesPerStockSheet(
  stockW: number,
  stockL: number,
  pieceW: number,
  pieceL: number,
): { count: number; orientation: "as-cut" | "rotated" } {
  if (pieceW <= 0 || pieceL <= 0 || stockW <= 0 || stockL <= 0) {
    return { count: 0, orientation: "as-cut" };
  }
  const a = Math.floor(stockW / pieceW) * Math.floor(stockL / pieceL);
  const b = Math.floor(stockW / pieceL) * Math.floor(stockL / pieceW);
  if (b > a) return { count: b, orientation: "rotated" };
  return { count: a, orientation: "as-cut" };
}

/**
 * Nest cut plates onto a stock sheet size (e.g. 1220×2440).
 * Gives both cut-weight and full-sheet material quantities so the quote can
 * charge either the finished size or the sheets that must be bought.
 */
export function nestPlateOnStock(
  grade: string,
  piece: { length: number; width: number; thickness: number },
  qty: number,
  stock: { width: number; length: number; label?: string } = {
    width: 1220,
    length: 2440,
    label: "1220 × 2440",
  },
): PlateNestResult {
  const { count, orientation } = piecesPerStockSheet(
    stock.width,
    stock.length,
    piece.width,
    piece.length,
  );
  const piecesPerSheet = Math.max(1, count); // at least 1 so sheetsNeeded is defined
  const sheetsNeeded = count > 0 ? Math.ceil(qty / count) : qty;
  const pieceWeightKg = steelWeightKg("plates", grade, piece);
  const sheetWeightKg = steelWeightKg("plates", grade, {
    length: stock.length,
    width: stock.width,
    thickness: piece.thickness,
  });
  const chargedWeightCutKg = pieceWeightKg * qty;
  const chargedWeightSheetsKg = sheetWeightKg * sheetsNeeded;
  const utilization =
    sheetWeightKg > 0 && sheetsNeeded > 0
      ? Math.min(1, chargedWeightCutKg / chargedWeightSheetsKg)
      : 0;

  return {
    stockWidth: stock.width,
    stockLength: stock.length,
    stockLabel: stock.label || `${stock.width} × ${stock.length}`,
    pieceWidth: piece.width,
    pieceLength: piece.length,
    piecesPerSheet: count,
    orientation,
    sheetsNeeded,
    totalPieces: qty,
    sheetWeightKg,
    pieceWeightKg,
    chargedWeightSheetsKg,
    chargedWeightCutKg,
    utilization,
  };
}

export type BarNestResult = {
  stockLengthMm: number;
  cutLengthMm: number;
  piecesPerBar: number;
  barsNeeded: number;
  totalCutLengthMm: number;
  chargedLengthMm: number; // full bars
  pieceWeightKg: number;
  chargedWeightBarsKg: number;
  chargedWeightCutKg: number;
  utilization: number;
};

/** Nest linear cuts onto stock bars (default 6 m). */
export function nestBarOnStock(
  category: Exclude<SteelCategory, "plates" | "cement">,
  grade: string,
  dims: Record<string, number>,
  qty: number,
  stockLengthMm = STOCK_BAR_LENGTH_MM,
  catalogKgPerM?: number,
): BarNestResult {
  const cutLengthMm = dims.length || 0;
  const piecesPerBar =
    cutLengthMm > 0 ? Math.floor(stockLengthMm / cutLengthMm) : 0;
  const barsNeeded = piecesPerBar > 0 ? Math.ceil(qty / piecesPerBar) : qty;
  const kgPerM = massPerMetreKg(category, grade, dims, catalogKgPerM);
  const pieceWeightKg = (kgPerM * cutLengthMm) / 1000;
  const chargedWeightCutKg = pieceWeightKg * qty;
  const chargedWeightBarsKg = (kgPerM * stockLengthMm * barsNeeded) / 1000;
  const totalCutLengthMm = cutLengthMm * qty;
  const chargedLengthMm = stockLengthMm * barsNeeded;
  const utilization =
    chargedLengthMm > 0 ? Math.min(1, totalCutLengthMm / chargedLengthMm) : 0;

  return {
    stockLengthMm,
    cutLengthMm,
    piecesPerBar,
    barsNeeded,
    totalCutLengthMm,
    chargedLengthMm,
    pieceWeightKg,
    chargedWeightBarsKg,
    chargedWeightCutKg,
    utilization,
  };
}

export type ChargeMode = "cut" | "stock";

/** Material kg to bill given charge mode and nest result. */
export function chargedMaterialKg(
  mode: ChargeMode,
  nest: { chargedWeightCutKg: number; chargedWeightSheetsKg?: number; chargedWeightBarsKg?: number },
): number {
  if (mode === "stock") {
    return nest.chargedWeightSheetsKg ?? nest.chargedWeightBarsKg ?? nest.chargedWeightCutKg;
  }
  return nest.chargedWeightCutKg;
}

// ── Fabrication ops (cut / bend / weld) ─────────────────────────────────────

export type FabOp = "cut" | "bend" | "weld";

export const FAB_OP_LABELS: Record<FabOp, string> = {
  cut: "Cutting",
  bend: "Bending",
  weld: "Welding",
};

/**
 * Simple fabrication cost helpers.
 * - cut: rate per metre of cut length (or per pierce if provided)
 * - bend: rate per bend × number of bends
 * - weld: rate per metre of weld
 */
export function fabCost(
  op: FabOp,
  rate: number,
  params: { metres?: number; count?: number },
): number {
  if (op === "bend") return rate * (params.count || 0);
  return rate * (params.metres || 0);
}

/** Approximate cut perimeter (m) for a rectangular plate piece. */
export function plateCutMetres(lengthMm: number, widthMm: number): number {
  return (2 * (lengthMm + widthMm)) / 1000;
}

// ── Product matching ───────────────────────────────────────────────────────

export type MatchedRate = {
  product: PriceableItem;
  score: number;
};

/**
 * Find the best-matching product in a catalog for a steel line item.
 * Scores name/category text + optional structured specs (thickness, OD, …).
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
  if (category === "cement") {
    catTokens.push("cement", "opc", "bag");
  }
  const gradeTokens = grade
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const thicknessToken = dims.thickness ? `${dims.thickness}` : null;
  const odToken = dims.od ? `${dims.od}` : dims.dia ? `${dims.dia}` : null;

  let best: MatchedRate | null = null;
  for (const p of products) {
    const hay = `${p.category} ${p.name}`.toLowerCase();
    const specs = p.specs || {};
    let score = 0;
    if (catTokens.some((t) => hay.includes(t))) score += 2;
    for (const t of gradeTokens) if (hay.includes(t)) score += 1;
    if (thicknessToken && (hay.includes(`${thicknessToken}mm`) || hay.includes(thicknessToken))) {
      score += 3;
    }
    if (odToken && (hay.includes(`${odToken}mm`) || hay.includes(odToken))) score += 2;
    // Structured catalogue specs
    if (thicknessToken && String(specs.thickness ?? specs.wall_thickness ?? "") === thicknessToken) {
      score += 4;
    }
    if (odToken && String(specs.outside_dia ?? specs.od ?? specs.nominal_bore ?? "") === odToken) {
      score += 4;
    }
    if (dims.pack_kg && String(specs.pack_size ?? "") === String(dims.pack_kg)) score += 3;
    if (score > 0 && (!best || score > best.score)) best = { product: p, score };
  }
  return best;
}

/** Line total (KSh) for material: weight(kg) × rate/kg  — or bags × rate/bag. */
export function steelLineTotal(
  weightOrQty: number,
  multiplier: number,
  rate: number,
): number {
  return weightOrQty * multiplier * rate;
}

/**
 * When product is sold per kg → use rate as-is.
 * When sold per m → convert to equivalent /kg using mass/m.
 * When sold per bag / pcs → rate is per unit (bags).
 */
export function effectiveRatePerKg(
  product: PriceableItem,
  category: SteelCategory,
  grade: string,
  dims: Record<string, number>,
  catalogKgPerM?: number,
): { ratePerKg: number; unit: string; note: string } {
  const unit = (product.unit || "kg").toLowerCase();
  const price = product.selling_price;
  if (unit === "bag" || unit === "bags" || unit === "pcs" || unit === "pc") {
    return { ratePerKg: price, unit, note: `priced per ${unit}` };
  }
  if (unit === "m" || unit === "metre" || unit === "meter" || unit === "lm") {
    const kgm = massPerMetreKg(category, grade, dims, catalogKgPerM);
    if (kgm > 0) {
      return { ratePerKg: price / kgm, unit: "kg (from /m)", note: `${price}/m ÷ ${kgm.toFixed(2)} kg/m` };
    }
  }
  // sheet / full plate unit: treat selling_price as per sheet — handled separately in UI
  if (unit === "sheet" || unit === "sheets" || unit === "pc sheet") {
    return { ratePerKg: price, unit: "sheet", note: "priced per stock sheet" };
  }
  return { ratePerKg: price, unit: "kg", note: "priced per kg" };
}

export function matchLabourRate(
  products: PriceableItem[],
  grade: string,
  thicknessMm: number,
): MatchedRate | null {
  const candidates = products.filter((p) =>
    /labour|labor|rolling|fabrication|cutting|bending|welding/i.test(`${p.category} ${p.name}`),
  );
  const gradeTokens = grade.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const thicknessToken = thicknessMm ? `${thicknessMm}mm` : null;

  let best: MatchedRate | null = null;
  for (const p of candidates) {
    const hay = `${p.category} ${p.name}`.toLowerCase();
    let score = 1;
    for (const t of gradeTokens) if (hay.includes(t)) score += 1;
    if (thicknessToken && hay.includes(thicknessToken)) score += 3;
    if (!best || score > best.score) best = { product: p, score };
  }
  return best;
}

export function labourLineTotal(weightKg: number, qty: number, ratePerKg: number): number {
  return weightKg * qty * ratePerKg;
}

/**
 * Length of straight bar (mm) consumed rolling it into a ring/hoop.
 * `overlapMm` covers weld join allowance (default 50 mm).
 */
export function rolledLength(diameterMm: number, overlapMm = 50): number {
  return Math.max(0, Math.PI * diameterMm + overlapMm);
}

/**
 * Read catalogue mass_kg_m from a matched product if present.
 */
export function catalogMassKgPerM(product?: PriceableItem | null): number | undefined {
  if (!product?.specs) return undefined;
  const v = product.specs.mass_kg_m ?? product.specs.mass_kg ?? product.specs.kg_m;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
