/** Client-side product/service import from CSV / Excel with validation. */

export type ImportedProductRow = {
  name: string;
  category: string;
  sku: string;
  unit: string;
  selling_price: number;
  cost_price: number;
  stock: number;
  description: string;
  item_kind: "product" | "service";
  /** Extra columns become specs (e.g. nominal_bore, thickness). */
  specs: Record<string, string | number>;
  /** 1-based spreadsheet row number for error messages. */
  row_number: number;
};

export type RowIssue = {
  row: number;
  field?: string;
  message: string;
  severity: "error" | "warning";
};

export type ImportResult = {
  rows: ImportedProductRow[];
  errors: string[];
  issues: RowIssue[];
  headers: string[];
  stats: {
    total_data_rows: number;
    valid: number;
    rejected: number;
    warnings: number;
  };
};

const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  product: "name",
  product_name: "name",
  "product name": "name",
  service: "name",
  service_name: "name",
  "service name": "name",
  item: "name",
  category: "category",
  cat: "category",
  sku: "sku",
  code: "sku",
  "item code": "sku",
  unit: "unit",
  uom: "unit",
  selling_price: "selling_price",
  price: "selling_price",
  "selling price": "selling_price",
  rate: "selling_price",
  cost_price: "cost_price",
  cost: "cost_price",
  "cost price": "cost_price",
  stock: "stock",
  qty: "stock",
  quantity: "stock",
  description: "description",
  desc: "description",
  notes: "description",
  type: "item_kind",
  kind: "item_kind",
  item_kind: "item_kind",
  "item type": "item_kind",
  "item kind": "item_kind",
};

function normalizeHeader(h: string): string {
  return h.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_-]+/g, " ");
}

/** Minimal CSV parser supporting quoted fields and commas inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === "," || c === "\t") {
      row.push(cell.trim());
      cell = "";
      i += 1;
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    cell += c;
    i += 1;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

function toNumber(raw: string): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const cleaned = String(raw).replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseKind(raw: string, fallback: "product" | "service"): "product" | "service" {
  const v = raw.trim().toLowerCase();
  if (!v) return fallback;
  if (["service", "services", "svc", "labour", "labor", "job"].includes(v)) return "service";
  if (["product", "products", "goods", "item", "stock"].includes(v)) return "product";
  return fallback;
}

function validateRow(
  base: ImportedProductRow,
  seenSkus: Map<string, number>,
  seenNames: Map<string, number>,
): RowIssue[] {
  const issues: RowIssue[] = [];
  const row = base.row_number;

  if (!base.name || base.name.length < 2) {
    issues.push({ row, field: "name", message: "Name is required (min 2 characters).", severity: "error" });
  } else if (base.name.length > 120) {
    issues.push({ row, field: "name", message: "Name is longer than 120 characters.", severity: "error" });
  }

  const nameKey = base.name.trim().toLowerCase();
  if (nameKey && seenNames.has(nameKey)) {
    issues.push({
      row,
      field: "name",
      message: `Duplicate name in file (same as row ${seenNames.get(nameKey)}).`,
      severity: "warning",
    });
  } else if (nameKey) {
    seenNames.set(nameKey, row);
  }

  if (base.sku) {
    if (base.sku.length > 40) {
      issues.push({ row, field: "sku", message: "SKU longer than 40 characters.", severity: "error" });
    }
    const skuKey = base.sku.trim().toLowerCase();
    if (seenSkus.has(skuKey)) {
      issues.push({
        row,
        field: "sku",
        message: `Duplicate SKU "${base.sku}" (also on row ${seenSkus.get(skuKey)}).`,
        severity: "error",
      });
    } else {
      seenSkus.set(skuKey, row);
    }
  }

  if (base.selling_price < 0) {
    issues.push({ row, field: "selling_price", message: "Selling price cannot be negative.", severity: "error" });
  }
  if (base.cost_price < 0) {
    issues.push({ row, field: "cost_price", message: "Cost price cannot be negative.", severity: "error" });
  }
  if (base.item_kind === "product") {
    if (base.stock < 0) {
      issues.push({ row, field: "stock", message: "Stock cannot be negative.", severity: "error" });
    }
    if (!Number.isInteger(base.stock) && base.stock !== 0) {
      // allow fractional stock for kg etc — only warn if weird
      if (base.stock > 1e9) {
        issues.push({ row, field: "stock", message: "Stock value looks unrealistically large.", severity: "warning" });
      }
    }
  }

  if (base.selling_price === 0) {
    issues.push({
      row,
      field: "selling_price",
      message: "Selling price is 0 — confirm this is intentional.",
      severity: "warning",
    });
  }

  if (base.unit && base.unit.length > 20) {
    issues.push({ row, field: "unit", message: "Unit longer than 20 characters.", severity: "warning" });
  }

  return issues;
}

function mapRows(table: string[][], defaultKind: "product" | "service" = "product"): ImportResult {
  const errors: string[] = [];
  const issues: RowIssue[] = [];
  const emptyStats = {
    total_data_rows: 0,
    valid: 0,
    rejected: 0,
    warnings: 0,
  };

  if (!table.length) {
    return {
      rows: [],
      errors: ["File is empty."],
      issues: [],
      headers: [],
      stats: emptyStats,
    };
  }
  if (table.length < 2) {
    return {
      rows: [],
      errors: ["File needs a header row and at least one data row."],
      issues: [],
      headers: table[0] || [],
      stats: emptyStats,
    };
  }

  const rawHeaders = table[0].map((h) => h.trim());
  if (rawHeaders.every((h) => !h)) {
    return {
      rows: [],
      errors: ["Header row is empty."],
      issues: [],
      headers: [],
      stats: emptyStats,
    };
  }

  const headers = rawHeaders.map(normalizeHeader);
  const mapped: (string | null)[] = headers.map(
    (h) => HEADER_ALIASES[h] ?? HEADER_ALIASES[h.replace(/\s+/g, "_")] ?? null,
  );

  if (!mapped.includes("name")) {
    errors.push('Missing a required "name" column (aliases: product, service, item).');
    return { rows: [], errors, issues, headers: rawHeaders, stats: emptyStats };
  }

  const seenSkus = new Map<string, number>();
  const seenNames = new Map<string, number>();
  const validRows: ImportedProductRow[] = [];
  let total_data_rows = 0;
  let rejected = 0;
  let warningCount = 0;

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    if (!cells || cells.every((c) => !String(c || "").trim())) continue;
    total_data_rows += 1;
    const row_number = r + 1;

    const base: ImportedProductRow = {
      name: "",
      category: "",
      sku: "",
      unit: defaultKind === "service" ? "job" : "unit",
      selling_price: 0,
      cost_price: 0,
      stock: 0,
      description: "",
      item_kind: defaultKind,
      specs: {},
      row_number,
    };

    let kindSet = false;
    for (let c = 0; c < rawHeaders.length; c++) {
      const key = mapped[c];
      const val = String(cells[c] ?? "").trim();
      if (!val && key !== "selling_price" && key !== "stock" && key !== "cost_price") continue;

      if (key === "name" || key === "category" || key === "sku" || key === "unit" || key === "description") {
        (base as Record<string, unknown>)[key] = val;
      } else if (key === "item_kind") {
        base.item_kind = parseKind(val, defaultKind);
        kindSet = true;
      } else if (key === "selling_price" || key === "cost_price" || key === "stock") {
        const n = toNumber(val);
        if (val && n === null) {
          issues.push({
            row: row_number,
            field: key,
            message: `"${val}" is not a valid number for ${key}.`,
            severity: "error",
          });
        } else if (n !== null) {
          base[key] = n;
        }
      } else if (key === null) {
        const specKey = headers[c].replace(/\s+/g, "_");
        if (!specKey) continue;
        const n = toNumber(val);
        base.specs[specKey] = n !== null && /^-?\d+(\.\d+)?$/.test(val.replace(/,/g, "")) ? n : val;
      }
    }

    if (!kindSet) base.item_kind = defaultKind;
    if (base.item_kind === "service") {
      base.stock = 0;
      if (!base.unit || base.unit === "unit") base.unit = "job";
    }

    const rowIssues = validateRow(base, seenSkus, seenNames);
    for (const issue of rowIssues) {
      issues.push(issue);
      if (issue.severity === "warning") warningCount += 1;
    }

    const hasError = rowIssues.some((i) => i.severity === "error");
    // also count prior numeric parse errors for this row
    const hasParseError = issues.some(
      (i) => i.row === row_number && i.severity === "error" && i.field && ["selling_price", "cost_price", "stock"].includes(i.field),
    );

    if (hasError || hasParseError) {
      rejected += 1;
      continue;
    }
    validRows.push(base);
  }

  if (total_data_rows === 0) {
    errors.push("No data rows found under the header.");
  }
  if (validRows.length === 0 && total_data_rows > 0) {
    errors.push("All rows failed validation. Fix the issues listed below and try again.");
  }

  return {
    rows: validRows,
    errors,
    issues,
    headers: rawHeaders,
    stats: {
      total_data_rows,
      valid: validRows.length,
      rejected,
      warnings: warningCount,
    },
  };
}

export function parseProductCsv(
  text: string,
  defaultKind: "product" | "service" = "product",
): ImportResult {
  return mapRows(parseCsv(text), defaultKind);
}

export async function parseProductSpreadsheet(
  file: File,
  defaultKind: "product" | "service" = "product",
): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    const text = await file.text();
    if (!text.trim()) {
      return {
        rows: [],
        errors: ["File is empty."],
        issues: [],
        headers: [],
        stats: { total_data_rows: 0, valid: 0, rejected: 0, warnings: 0 },
      };
    }
    return parseProductCsv(text, defaultKind);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      if (!buf.byteLength) {
        return {
          rows: [],
          errors: ["Excel file is empty."],
          issues: [],
          headers: [],
          stats: { total_data_rows: 0, valid: 0, rejected: 0, warnings: 0 },
        };
      }
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        defval: "",
        raw: false,
      }) as string[][];
      return mapRows(
        aoa.map((r) => r.map((c) => String(c ?? ""))),
        defaultKind,
      );
    } catch {
      return {
        rows: [],
        errors: [
          "Excel (.xlsx) needs the xlsx package. Run: npm install xlsx — or save the sheet as CSV and import that.",
        ],
        issues: [],
        headers: [],
        stats: { total_data_rows: 0, valid: 0, rejected: 0, warnings: 0 },
      };
    }
  }
  return {
    rows: [],
    errors: ["Unsupported file type. Use .csv or .xlsx"],
    issues: [],
    headers: [],
    stats: { total_data_rows: 0, valid: 0, rejected: 0, warnings: 0 },
  };
}

export function productImportTemplateCsv(kind: "product" | "service" = "product"): string {
  if (kind === "service") {
    return [
      "name,category,sku,unit,selling_price,cost_price,description,type",
      "Laser Cut Mild Steel 3mm,Cutting,SVC-LC-MS-3,m,800,0,Per metre of cut path,service",
      "Engraving Acrylic 5mm,Engraving,SVC-ENG-AC-5,m,400,0,Per metre of engrave path,service",
      "Site consultation,Professional,SVC-CONSULT,hour,2500,0,On-site advisory,service",
    ].join("\n");
  }
  return [
    "name,category,sku,unit,selling_price,cost_price,stock,description,type,nominal_bore,outside_dia,mass_kg_m",
    "Mild steel CHS 50,CHS Mild Steel,CHS-50,m,450,320,100,Pipe section,product,50,60.3,5.43",
    "MS Plate 3mm,Plate,PLT-3,kg,180,140,500,Mild steel plate 3mm,product,,,,",
  ].join("\n");
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
