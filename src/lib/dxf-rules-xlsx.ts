/** Import / export of the DXF cut pricing list as an Excel file (PricingRules layout). */
import { materialKey } from "@/lib/dxf-calc";
import type { DxfCutRule, DxfRuleDraft } from "@/lib/types";

const HEADERS = ["material", "rangeIndex", "thickness", "pierceCost", "cutRate", "cutSpeed", "description"] as const;

const ALIASES: Record<string, (typeof HEADERS)[number]> = {
  material: "material",
  thickness: "thickness",
  "thickness mm": "thickness",
  piercecost: "pierceCost",
  pierce: "pierceCost",
  "pierce cost": "pierceCost",
  cutrate: "cutRate",
  "cut rate": "cutRate",
  cutspeed: "cutSpeed",
  "cut speed": "cutSpeed",
  speed: "cutSpeed",
  description: "description",
  gas: "description",
  notes: "description",
};

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/[_()-]+/g, " ").replace(/\s+/g, " ").trim();

function num(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export type DxfImportResult = { rules: DxfRuleDraft[]; skipped: number; missingCutRate: number; sheet: string };

/** Read a .xlsx/.xls/.csv pricing list. Looks for the "PricingRules" sheet, else the first sheet with material + thickness headers. */
export async function readDxfRulesFile(file: File): Promise<DxfImportResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const names = wb.SheetNames;
  const ordered = [
    ...names.filter((n) => norm(n) === "pricingrules" || norm(n) === "pricing rules"),
    ...names.filter((n) => norm(n) !== "pricingrules" && norm(n) !== "pricing rules"),
  ];

  for (const name of ordered) {
    const grid = XLSX.utils.sheet_to_json<unknown[][]>(wb.Sheets[name], { header: 1, defval: "", raw: true });
    const headerRow = grid.findIndex((r) => {
      const keys = r.map((c) => ALIASES[norm(c).replace(/ /g, "")] ?? ALIASES[norm(c)]);
      return keys.includes("material") && keys.includes("thickness");
    });
    if (headerRow < 0) continue;

    const col: Partial<Record<(typeof HEADERS)[number], number>> = {};
    grid[headerRow].forEach((c, i) => {
      const k = ALIASES[norm(c).replace(/ /g, "")] ?? ALIASES[norm(c)];
      if (k && col[k] === undefined) col[k] = i;
    });

    const rules: DxfRuleDraft[] = [];
    let skipped = 0;
    let missingCutRate = 0;
    for (const r of grid.slice(headerRow + 1)) {
      if (r.every((c) => c === "" || c == null)) continue;
      const material = String(r[col.material!] ?? "").trim();
      const thickness = num(r[col.thickness!]);
      // Rows without a material and a positive thickness (titles, notes) are ignored.
      if (!material || thickness == null || thickness <= 0) {
        skipped++;
        continue;
      }
      const cut = col.cutRate !== undefined ? num(r[col.cutRate]) : null;
      if (cut == null) missingCutRate++;
      rules.push({
        material,
        thickness,
        pierce_cost: (col.pierceCost !== undefined ? num(r[col.pierceCost]) : null) ?? 0,
        cut_rate: cut,
        cut_speed: col.cutSpeed !== undefined ? num(r[col.cutSpeed]) : null,
        description: col.description !== undefined ? String(r[col.description] ?? "").trim() : "",
      });
    }
    if (rules.length) return { rules, skipped, missingCutRate, sheet: name };
  }
  throw new Error("No pricing rows found. Expected columns: material, thickness, pierceCost, cutRate, cutSpeed, description.");
}

/** Download the list as an .xlsx with the same columns as the original PricingRules sheet. */
export async function downloadDxfRules(rules: DxfCutRule[], fileName = "dxf-cut-pricing-rules.xlsx") {
  const XLSX = await import("xlsx");
  const order: string[] = [];
  for (const r of rules) {
    const k = materialKey(r.material);
    if (!order.includes(k)) order.push(k);
  }
  const rows: (string | number)[][] = [[...HEADERS]];
  for (const k of order) {
    rules
      .filter((r) => materialKey(r.material) === k)
      .sort((a, b) => a.thickness - b.thickness)
      .forEach((r, i) =>
        rows.push([r.material, i, r.thickness, r.pierce_cost, r.cut_rate ?? "", r.cut_speed ?? "", r.description]),
      );
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "PricingRules");
  XLSX.writeFile(wb, fileName);
}
