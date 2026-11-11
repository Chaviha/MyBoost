import { useMemo, useState, useCallback, useEffect } from "react";
import {
  Plus,
  Calculator,
  Trash2,
  Columns3,
  Package,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Field } from "@/components/field";
import { money, uid } from "@/lib/format";
import { evaluateFormula as evaluateArithmetic } from "@/lib/formula-eval";
import type { MarketplaceProduct, QuoteLineItem, Product } from "@/lib/types";
import { useLife } from "@/lib/store";
import { applyCatalogueValues } from "@/lib/catalogue-sync";
import { listProductRateOptions, resolveCatalogueRate } from "@/lib/rate-table-select";
import { SubProductEditor, SubProductPicker } from "@/components/sub-product-editor";
import {
  applySubProductRates,
  deriveSubColumns,
  subProductSelectionCells,
  type SubColumnDef,
  type SubProduct,
} from "@/lib/sub-products";

/** Column data types the product creator / quoter can choose. */
export type ColumnType = "text" | "number" | "catalogue" | "formula" | "dropdown" | "subproduct";

export type CalcColumn = {
  id: string;
  key: string;
  label: string;
  type: ColumnType;
  /** For formula columns: expression using other column keys, e.g. =QTY*RATE or =LENGTH*WIDTH*RATE */
  formula?: string;
  /** When true, end-users quoting may edit this column (product creator controls this). */
  editableByQuoter: boolean;
  /** Optional unit shown next to the header (mm, kg, pcs…). */
  unit?: string;
  /** When true, quoter cannot change this column (mainly for locked dropdowns). */
  sizeLocked?: boolean;
  /** Choices for dropdown columns — text values created by the product creator. */
  options?: string[];
  /** Source product whose rate table supplies RATE/DENSITY when this dropdown changes. */
  lookupProductId?: string;
  /** Column key on the source product to match (e.g. MATERIAL). Defaults to this column’s key. */
  lookupMatchKey?: string;
  /** Keys to copy from the matched source row (e.g. RATE, DENSITY). */
  lookupFillKeys?: string[];
  /** Fixed rate-table option on the linked product (product + specific dropdown). */
  lookupOption?: string;
  /** Sub-products column: products nested inside this product (one dropdown per layer). */
  subProducts?: SubProduct[];
  /** Sub-products column: the grid's own columns (text / number / formula / catalogue). */
  subColumns?: SubColumnDef[];
};

/** Normalize legacy "size" type to "dropdown" and coerce option values to strings. */
function normalizeColumnType(type: string): ColumnType {
  if (type === "size") return "dropdown";
  if (type === "text" || type === "number" || type === "catalogue" || type === "formula" || type === "dropdown" || type === "subproduct") {
    return type;
  }
  return "text";
}

function normalizeOptions(options?: (string | number)[] | null): string[] | undefined {
  if (!options?.length) return undefined;
  return options.map((o) => String(o));
}

/**
 * Look up RATE / DENSITY (or other fields) from a source product’s rate table
 * by matching the selected dropdown value (e.g. MS → rate row for MS).
 */
export type RateLookupResult = {
  values: Record<string, string | number | null>;
  /** True when the source product has no rate table and no primary cells to fall back on. */
  missingRateTable?: boolean;
  /** True when a rate table exists but no row matched the selected value. */
  noMatchingRow?: boolean;
  /** Human-readable message for toasts / UI. */
  error?: string;
};

type RateLookupSource =
  | {
      name?: string;
      customizer?: {
        rateTable?: Array<Record<string, string | number | null>>;
        cells?: Record<string, string | number | null>;
        columns?: Array<{ key: string; type?: string; options?: string[] }>;
      } | null;
      specs?: Record<string, string | number>;
      selling_price?: number;
    }
  | null
  | undefined;

/**
 * Look up RATE / DENSITY (or other fields) from a source product’s rate table
 * by matching the selected dropdown value. Returns values plus error flags when
 * the rate table is missing or the selection does not match any row.
 */
export function lookupRatesFromProductDetailed(
  sourceProduct: RateLookupSource,
  selectedValue: string,
  matchKey: string,
  fillKeys: string[],
): RateLookupResult {
  const result: Record<string, string | number | null> = {};
  if (!selectedValue || !fillKeys.length) {
    return { values: result };
  }
  if (!sourceProduct) {
    return {
      values: result,
      missingRateTable: true,
      error: "No source product linked for rate lookup.",
    };
  }

  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const want = norm(selectedValue);
  const productLabel = sourceProduct.name ? `“${sourceProduct.name}”` : "the linked product";

  const hasRateTable = Boolean(sourceProduct.customizer?.rateTable?.length);
  const hasCells = Boolean(
    sourceProduct.customizer?.cells && Object.keys(sourceProduct.customizer.cells).length,
  );

  const table =
    hasRateTable
      ? sourceProduct.customizer!.rateTable!
      : hasCells
        ? [sourceProduct.customizer!.cells!]
        : [];

  if (!table.length) {
    return {
      values: result,
      missingRateTable: true,
      error: `No rate table on ${productLabel}. Open it in the Spreadsheet product builder, add at least one row, and save.`,
    };
  }

  const matchKeys = [
    matchKey,
    matchKey.toUpperCase(),
    matchKey.toLowerCase(),
    "MATERIAL",
    "Material",
    "material",
    "OPTION",
    "Option",
    "TYPE",
    "Type",
    "DESCRIPTION",
    "Description",
  ].filter(Boolean);

  const row = table.find((r) =>
    matchKeys.some((k) => r[k] !== undefined && r[k] !== null && norm(r[k]) === want),
  );

  if (row) {
    for (const key of fillKeys) {
      const variants = [key, key.toUpperCase(), key.toLowerCase()];
      for (const v of variants) {
        if (row[v] !== undefined && row[v] !== null && row[v] !== "") {
          result[key] = row[v];
          break;
        }
      }
    }
    return { values: result };
  }

  // Fallback: specs on the source product (e.g. density_ms)
  const specs = sourceProduct.specs || {};
  let filledFromSpecs = false;
  for (const key of fillKeys) {
    const candidates = [
      specs[`${key}_${selectedValue}`],
      specs[`${key.toLowerCase()}_${want}`],
      specs[`${want}_${key}`],
      specs[`${want}_${key.toLowerCase()}`],
      specs[key],
      specs[key.toLowerCase()],
    ];
    for (const c of candidates) {
      if (c !== undefined && c !== null && c !== "") {
        result[key] = c;
        filledFromSpecs = true;
        break;
      }
    }
  }
  if (filledFromSpecs) {
    return { values: result };
  }

  return {
    values: result,
    noMatchingRow: true,
    error: hasRateTable
      ? `No rate-table row on ${productLabel} matches “${selectedValue}”. Add that option as a row in the Spreadsheet product builder and save.`
      : `Could not resolve rates for “${selectedValue}” on ${productLabel}.`,
  };
}

/** Convenience wrapper — returns only the filled cell values (existing callers). */
export function lookupRatesFromProduct(
  sourceProduct: RateLookupSource,
  selectedValue: string,
  matchKey: string,
  fillKeys: string[],
): Record<string, string | number | null> {
  return lookupRatesFromProductDetailed(sourceProduct, selectedValue, matchKey, fillKeys).values;
}

export type CalcCellValue = string | number | null;

export type CalcRow = {
  id: string;
  cells: Record<string, CalcCellValue>;
  /** Per-row formula overrides for formula columns (Excel-style). Falls back to column default. */
  formulas?: Record<string, string>;
  /** When a catalogue column is used, store the matched product for costing. */
  catalogueProductId?: string;
  /** Catalogue column key → linked product_id. The cell itself holds the synced price, not the id. */
  catalogueLinks?: Record<string, string>;
  /** Catalogue column key → specific rate-table option on the linked product (product + dropdown). */
  catalogueVariants?: Record<string, string>;
};

function slugKey(label: string, existing: string[]): string {
  const base =
    label
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "COL";
  let key = base;
  let n = 2;
  while (existing.includes(key)) {
    key = `${base}_${n++}`;
  }
  return key;
}

/** Safe arithmetic evaluator — numbers, + - * / ( ) only. */
/* evaluateArithmetic imported from @/lib/formula-eval */

function evaluateRowFormula(
  formula: string,
  cells: Record<string, CalcCellValue>,
  columns: CalcColumn[],
): number {
  let expr = formula.trim().replace(/^=/, "");
  const keys = columns.map((c) => c.key).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const val = cells[key];
    const num = typeof val === "number" ? val : Number(val ?? 0);
    const re = new RegExp(`\\b${key}\\b`, "gi");
    expr = expr.replace(re, String(Number.isFinite(num) ? num : 0));
  }
  return evaluateArithmetic(expr);
}

function defaultColumns(): CalcColumn[] {
  return [
    {
      id: uid("COL"),
      key: "DESCRIPTION",
      label: "Description",
      type: "text",
      editableByQuoter: true,
    },
    {
      id: uid("COL"),
      key: "OPTION",
      label: "Option",
      type: "dropdown",
      editableByQuoter: true,
      options: [],
    },
    {
      id: uid("COL"),
      key: "QTY",
      label: "Qty",
      type: "number",
      editableByQuoter: true,
    },
    {
      id: uid("COL"),
      key: "UNIT",
      label: "Unit",
      type: "text",
      editableByQuoter: true,
    },
    {
      id: uid("COL"),
      key: "RATE",
      label: "Rate",
      type: "number",
      editableByQuoter: true,
      unit: "KSh",
    },
    {
      id: uid("COL"),
      key: "AMOUNT",
      label: "Amount",
      type: "formula",
      formula: "=QTY*RATE",
      editableByQuoter: true,
      unit: "KSh",
    },
  ];
}

/** Rebuild the grid (columns + rows) from a product that was saved with the spreadsheet builder. */
function seedFromProduct(product?: Product): { columns: CalcColumn[]; rows: CalcRow[] } {
  const saved = product?.customizer;
  if (!saved?.columns?.length) {
    const columns = defaultColumns();
    return { columns, rows: [newRow(columns)] };
  }
  const columns: CalcColumn[] = saved.columns.map((c) => ({
    id: uid("COL"),
    key: c.key,
    label: c.label || c.key,
    type: normalizeColumnType(c.type),
    formula: c.formula,
    editableByQuoter: c.editableByQuoter !== false,
    unit: c.unit,
    sizeLocked: !!c.sizeLocked,
    options: normalizeOptions(c.options as (string | number)[] | undefined),
    lookupProductId: (c as { lookupProductId?: string }).lookupProductId,
    lookupMatchKey: (c as { lookupMatchKey?: string }).lookupMatchKey,
    lookupFillKeys: (c as { lookupFillKeys?: string[] }).lookupFillKeys,
    lookupOption: (c as { lookupOption?: string }).lookupOption,
    subProducts: (c as { subProducts?: SubProduct[] }).subProducts,
    subColumns:
      (c as { subColumns?: SubColumnDef[] }).subColumns ??
      (c.type === "subproduct"
        ? deriveSubColumns((c as { subProducts?: SubProduct[] }).subProducts)
        : undefined),
  }));
  const base = newRow(columns);
  let catalogueProductId = saved.catalogueProductId || product?.reference_product_id;
  if (!catalogueProductId) {
    for (const c of saved.columns || []) {
      if (c.type !== "catalogue") continue;
      const v = String(saved.cells?.[c.key] || "");
      if (v) {
        catalogueProductId = v;
        break;
      }
    }
  }
  // Catalogue columns: keep the id link separately; the cell holds the synced price.
  const catalogueLinks: Record<string, string> = { ...(saved.catalogueLinks || {}) };

  type SavedRow = {
    cells?: Record<string, string | number | null>;
    formulas?: Record<string, string>;
    catalogueProductId?: string;
    catalogueLinks?: Record<string, string>;
  };
  const savedRows: SavedRow[] =
    Array.isArray((saved as { rows?: SavedRow[] }).rows) && (saved as { rows?: SavedRow[] }).rows!.length
      ? (saved as { rows?: SavedRow[] }).rows!
      : saved.rateTable?.length
        ? saved.rateTable.map((cells) => ({ cells, formulas: saved.formulas }))
        : [{ cells: saved.cells || {}, formulas: saved.formulas }];

  const rows: CalcRow[] = savedRows.map((sr) => {
    const seededCells = { ...base.cells, ...(sr.cells || {}) };
    const rowLinks = { ...catalogueLinks, ...(sr.catalogueLinks || {}) };
    for (const c of saved.columns || []) {
      if (c.type !== "catalogue") continue;
      const raw = String(seededCells[c.key] ?? "");
      if (!rowLinks[c.key] && raw && Number.isNaN(Number(raw))) {
        rowLinks[c.key] = raw;
      }
      if (rowLinks[c.key] && typeof seededCells[c.key] !== "number") seededCells[c.key] = 0;
    }
    return {
      ...base,
      id: uid("ROW"),
      cells: seededCells,
      formulas: { ...(base.formulas || {}), ...(sr.formulas || {}), ...(saved.formulas || {}) },
      catalogueProductId: sr.catalogueProductId || catalogueProductId,
      catalogueLinks: rowLinks,
    };
  });

  return {
    columns,
    rows: rows.length ? rows : [base],
  };
}

function newRow(columns: CalcColumn[]): CalcRow {
  const cells: Record<string, CalcCellValue> = {};
  const formulas: Record<string, string> = {};
  for (const col of columns) {
    if (col.type === "number") cells[col.key] = col.key === "QTY" ? 1 : 0;
    else if (col.type === "formula") {
      cells[col.key] = null;
      formulas[col.key] = col.formula || "=0";
    } else cells[col.key] = col.key === "UNIT" ? "item" : "";
  }
  return { id: uid("ROW"), cells, formulas };
}

type Props = {
  /** Catalogue products available for "catalogue" columns and costing. */
  products?: (MarketplaceProduct | Product)[];
  /** When provided, the component is in "product creator" mode — can lock sizes and define templates. */
  mode?: "quoter" | "product_creator";
  /** Optional product name context when customizing an existing product. */
  productName?: string;
  /** Edit mode: open the builder pre-filled with this saved product (columns, formulas, locks, values). */
  initialProduct?: Product;
  onAddToQuote?: (item: QuoteLineItem) => void;
  /** Called when the creator saves a configuration or produces a costed product line. */
  onAddToProduct?: (payload: {
    description: string;
    unit: string;
    cost_price: number;
    selling_price: number;
    specs: Record<string, string | number>;
    meta: Record<string, unknown>;
    /** Creator's choice: may other businesses use this product in their quotations? */
    customizer_shared?: boolean;
  }) => void;
};

export function AdvancedQuotationCalculator({
  products = [],
  mode = "quoter",
  productName,
  initialProduct,
  onAddToQuote,
  onAddToProduct,
}: Props) {
  const isCreator = mode === "product_creator";
  const isEditing = Boolean(initialProduct);
  const { state, selectedBusiness } = useLife();
  /** Catalogue products for rate-lookup dropdown (props + current business). */
  const catalogueProducts = useMemo(() => {
    const fromProps = products || [];
    const bid = selectedBusiness?.business_id;
    const fromStore = (state.products || []).filter(
      (p) => !bid || p.business_id === bid,
    );
    const map = new Map<string, MarketplaceProduct | Product>();
    for (const p of [...fromStore, ...fromProps]) {
      const id =
        "product_id" in p && p.product_id
          ? String(p.product_id)
          : String((p as { product_id?: string }).product_id || "");
      if (id) map.set(id, p);
    }
    // Prefer products that already have a rate table when sorting
    return [...map.values()].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || "")),
    );
  }, [products, state.products, selectedBusiness?.business_id]);
  const [seed] = useState(() => seedFromProduct(initialProduct));
  const [columns, setColumns] = useState<CalcColumn[]>(seed.columns);
  const [rows, setRows] = useState<CalcRow[]>(() => seed.rows);
  const [showColumnEditor, setShowColumnEditor] = useState(true); // open columns by default so dropdown product link is visible
  /** Text for the next dropdown choice being typed (one at a time — no commas needed). */
  const [newOptionText, setNewOptionText] = useState<Record<string, string>>({});
  const [fillKeysDraft, setFillKeysDraft] = useState<Record<string, string>>({});
  const [newColLabel, setNewColLabel] = useState("");
  const [newColType, setNewColType] = useState<ColumnType>("number");
  const [newColFormula, setNewColFormula] = useState("=QTY*RATE");
  const [newColUnit, setNewColUnit] = useState("");
  const [added, setAdded] = useState(false);
  const [catalogueSearch, setCatalogueSearch] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [localProductName, setLocalProductName] = useState(productName || initialProduct?.name || "");
  const [localUnit, setLocalUnit] = useState(initialProduct?.unit || "item");
  const [localCategory, setLocalCategory] = useState(initialProduct?.category || "");
  const [localSku, setLocalSku] = useState(initialProduct?.sku || "");
  const [shareAcrossBusinesses, setShareAcrossBusinesses] = useState(
    Boolean(initialProduct?.customizer_shared),
  );
  const [saved, setSaved] = useState(false);

  const calculated = useMemo(() => {
    return rows.map((row) => {
      const cells = { ...row.cells };
      const errors: Record<string, string> = {};
      const formulas = { ...(row.formulas || {}) };
      for (const col of columns) {
        if (col.type !== "formula") continue;
        const expr = (formulas[col.key] ?? col.formula ?? "0").trim() || "0";
        if (!(col.key in formulas)) formulas[col.key] = expr.startsWith("=") ? expr : `=${expr}`;
        try {
          const amount = evaluateRowFormula(expr, cells, columns);
          cells[col.key] = amount;
        } catch (e) {
          cells[col.key] = 0;
          errors[col.key] = e instanceof Error ? e.message : "Invalid formula";
        }
      }
      const amountCol =
        columns.find((c) => c.key === "AMOUNT" && c.type === "formula") ||
        columns.filter((c) => c.type === "formula").at(-1);
      const amount = amountCol ? Number(cells[amountCol.key] ?? 0) : 0;
      return { ...row, cells, formulas, errors, amount };
    });
  }, [rows, columns]);

  const total = calculated.reduce(
    (sum, r) => sum + (Object.keys(r.errors).length ? 0 : r.amount),
    0,
  );

  const previewProduct = useMemo(() => {
    const primary = calculated[0];
    const description =
      productName ||
      String(primary?.cells.DESCRIPTION ?? "").trim() ||
      (calculated.length > 1 ? `Custom product (${calculated.length} lines)` : "Custom product");
    const unit = String(primary?.cells.UNIT ?? "item");
    const specs: { label: string; key: string; value: string; unit?: string }[] = [];
    if (primary) {
      for (const col of columns) {
        if (col.type === "formula") continue;
        if (col.key === "DESCRIPTION" || col.key === "UNIT") continue;
        const v = primary.cells[col.key];
        if (v === null || v === undefined || v === "") continue;
        specs.push({
          label: col.label,
          key: col.key,
          value: String(v),
          unit: col.unit,
        });
      }
    }
    const lines = calculated.map((r, i) => {
      const desc = String(
        r.cells.DESCRIPTION ?? r.cells[columns.find((c) => c.type === "text")?.key ?? ""] ?? `Line ${i + 1}`,
      ).trim();
      const qty = Number(r.cells.QTY ?? 1) || 1;
      const lineUnit = String(r.cells.UNIT ?? unit);
      const rate = Number(r.cells.RATE ?? (qty ? r.amount / qty : 0)) || 0;
      return {
        description: desc || `Line ${i + 1}`,
        qty,
        unit: lineUnit,
        rate,
        amount: r.amount,
        hasError: Object.keys(r.errors).length > 0,
      };
    });
    return { description, unit, specs, lines, total };
  }, [calculated, columns, productName, total]);

  /** Keep RATE in sync with the linked catalogue product’s current selling_price. */
  useEffect(() => {
    setRows((current) => {
      let changed = false;
      const next = current.map((r0) => {
        let r = r0;
        // Catalogue columns: refresh each linked cell with the product's current price
        let row = r;
        if (r.catalogueLinks && Object.keys(r.catalogueLinks).length) {
          const synced = applyCatalogueValues(
            r.cells,
            r.catalogueLinks,
            catalogueProducts as Array<Pick<Product, "product_id" | "selling_price"> & { customizer?: Product["customizer"] }>,
            r.catalogueVariants,
          );
          if (Object.keys(r.catalogueLinks).some((k) => synced[k] !== r.cells[k])) {
            changed = true;
            row = { ...r, cells: synced };
          }
        }
        // Sub-product columns: keep RATE following the picked product's live price
        const subRateKey =
          columns.find((c) => c.key === "RATE")?.key ||
          columns.find((c) => c.type === "number" && c.key !== "QTY")?.key ||
          "RATE";
        const subCells = applySubProductRates(
          row.cells,
          columns,
          catalogueProducts as Array<{ product_id?: string; selling_price?: number }>,
          subRateKey,
        );
        if (subCells !== row.cells) {
          changed = true;
          row = { ...row, cells: subCells };
        }
        if (!row.catalogueProductId) return row;
        r = row;
        const src = catalogueProducts.find(
          (p) =>
            ("product_id" in p && p.product_id === r.catalogueProductId) ||
            (p as { product_id?: string }).product_id === r.catalogueProductId,
        );
        if (!src || typeof (src as Product).selling_price !== "number") return r;
        const rateKey =
          columns.find((c) => c.key === "RATE")?.key ||
          columns.find((c) => c.type === "number" && c.key !== "QTY")?.key ||
          "RATE";
        const live = Number((src as Product).selling_price);
        if (Number(r.cells[rateKey]) === live) return r;
        changed = true;
        return { ...r, cells: { ...r.cells, [rateKey]: live } };
      });
      return changed ? next : current;
    });
  }, [catalogueProducts, columns]);

  const updateCell = useCallback(
    (rowId: string, key: string, value: CalcCellValue) => {
      setRows((current) =>
        current.map((r) => {
          if (r.id !== rowId) return r;
          let cells: Record<string, CalcCellValue> = { ...r.cells, [key]: value };
          const col = columns.find((c) => c.key === key);
          if (col?.type === "dropdown" && col.lookupProductId && value) {
            const source = catalogueProducts.find(
              (p) =>
                ("product_id" in p && p.product_id === col.lookupProductId) ||
                (p as { product_id?: string }).product_id === col.lookupProductId,
            ) as
              | {
                  customizer?: {
                    rateTable?: Array<Record<string, string | number | null>>;
                    cells?: Record<string, string | number | null>;
                  };
                  specs?: Record<string, string | number>;
                }
              | undefined;
            const fillKeys =
              col.lookupFillKeys?.length
                ? col.lookupFillKeys
                : ["RATE", "DENSITY", "Rate", "Density"].filter((k) =>
                    columns.some((c) => c.key.toUpperCase() === k.toUpperCase()),
                  );
            const matchKey = col.lookupMatchKey || col.key;
            const lookup = lookupRatesFromProductDetailed(
              source,
              String(value),
              matchKey,
              fillKeys.length ? fillKeys : ["RATE", "DENSITY"],
            );
            if (lookup.error) {
              toast.error(lookup.error);
            }
            // Map filled keys onto this product’s actual column keys (case-insensitive)
            for (const [srcKey, srcVal] of Object.entries(lookup.values)) {
              const target =
                columns.find((c) => c.key.toUpperCase() === srcKey.toUpperCase())?.key || srcKey;
              cells[target] = srcVal;
            }
          }
          return { ...r, cells };
        }),
      );
      setAdded(false);
    },
    [columns, catalogueProducts],
  );

  const updateFormula = useCallback((rowId: string, key: string, formula: string) => {
    setRows((current) =>
      current.map((r) =>
        r.id === rowId
          ? { ...r, formulas: { ...(r.formulas || {}), [key]: formula } }
          : r,
      ),
    );
    setAdded(false);
  }, []);

  /** Locked / non-editable fields: creators only. Quoters never edit sizeLocked or !editableByQuoter. */
  const canEditColumn = (col: CalcColumn) => {
    if (isCreator) return true;
    if (col.type === "dropdown" && col.sizeLocked) return false;
    if (!col.editableByQuoter) return false;
    return true;
  };

  function addColumn() {
    const label = newColLabel.trim() || `Column ${columns.length + 1}`;
    const key = slugKey(label, columns.map((c) => c.key));
    const col: CalcColumn = {
      id: uid("COL"),
      key,
      label,
      type: newColType,
      formula: newColType === "formula" ? newColFormula || "=0" : undefined,
      editableByQuoter: newColType !== "formula",
      unit: newColUnit.trim() || undefined,
      sizeLocked: newColType === "dropdown" ? false : undefined,
      options: newColType === "dropdown" ? [] : undefined,
      subProducts: newColType === "subproduct" ? [] : undefined,
      subColumns: newColType === "subproduct" ? [] : undefined,
    };
    setColumns((c) => [...c, col]);
    setRows((rs) =>
      rs.map((r) => ({
        ...r,
        cells: {
          ...r.cells,
          [key]:
            newColType === "number"
              ? 0
              : newColType === "formula"
                ? null
                : "",
        },
        formulas:
          newColType === "formula"
            ? { ...(r.formulas || {}), [key]: col.formula || "=0" }
            : r.formulas,
      })),
    );
    setNewColLabel("");
    setNewColUnit("");
    setNewColType("number");
    setNewColFormula("=QTY*RATE");
    toast.success(`Column “${label}” added`);
  }

  function removeColumn(id: string) {
    const col = columns.find((c) => c.id === id);
    if (!col) return;
    if (columns.length <= 2) {
      toast.error("Keep at least two columns.");
      return;
    }
    setColumns((c) => c.filter((x) => x.id !== id));
    setRows((rs) =>
      rs.map((r) => {
        const next = { ...r.cells };
        delete next[col.key];
        return { ...r, cells: next };
      }),
    );
  }

  function toggleEditable(id: string) {
    setColumns((c) =>
      c.map((col) => (col.id === id ? { ...col, editableByQuoter: !col.editableByQuoter } : col)),
    );
  }

  function toggleSizeLock(id: string) {
    setColumns((c) =>
      c.map((col) => (col.id === id ? { ...col, sizeLocked: !col.sizeLocked } : col)),
    );
  }

  function updateColumnMeta(id: string, patch: Partial<CalcColumn>) {
    setColumns((c) => c.map((col) => (col.id === id ? { ...col, ...patch } : col)));
  }

  /** Sub-products: save the picked path and fill RATE / UNIT from the deepest picked product. */
  function setSubProduct(rowId: string, col: CalcColumn, label: string) {
    const rateKey =
      columns.find((c) => c.key === "RATE")?.key ||
      columns.find((c) => c.type === "number" && c.key !== "QTY")?.key;
    const unitKey = columns.find((c) => c.key === "UNIT")?.key;
    const patch = subProductSelectionCells(
      col,
      label,
      catalogueProducts as Array<{ product_id?: string; selling_price?: number }>,
      rateKey,
      unitKey,
      columns.map((c) => c.key),
    );
    setRows((current) =>
      current.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, ...patch } } : r)),
    );
    setAdded(false);
  }

  function pickCatalogue(
    rowId: string,
    colKey: string,
    product: MarketplaceProduct | Product,
    variant?: string,
  ) {
    const productId =
      "product_id" in product && product.product_id
        ? String(product.product_id)
        : undefined;
    const descKey =
      columns.find((c) => c.key === "DESCRIPTION")?.key ||
      columns.find((c) => c.type === "text")?.key;
    const rateKey =
      columns.find((c) => c.key === "RATE")?.key ||
      columns.find((c) => c.type === "number" && c.key !== "QTY")?.key;
    const unitKey = columns.find((c) => c.key === "UNIT")?.key;
    const resolved = resolveCatalogueRate(
      product as { customizer?: Product["customizer"]; selling_price?: number },
      variant,
    );
    const price = resolved !== null ? resolved : Number(product.selling_price) || 0;

    setRows((current) =>
      current.map((r) => {
        if (r.id !== rowId) return r;
        const cells = { ...r.cells };
        if (descKey) {
          cells[descKey] = variant
            ? `${product.name} · ${variant}`
            : product.name;
        }
        if (rateKey) cells[rateKey] = price;
        if (unitKey) cells[unitKey] = product.unit || "item";
        // The catalogue column gets the synced PRICE (product or specific rate-table row);
        // the id is kept in catalogueLinks so the value follows future price changes.
        const links = { ...(r.catalogueLinks || {}) };
        const variants = { ...(r.catalogueVariants || {}) };
        cells[colKey] = price;
        if (productId) links[colKey] = productId;
        else delete links[colKey];
        if (variant && String(variant).trim()) variants[colKey] = String(variant).trim();
        else delete variants[colKey];
        for (const col of columns) {
          if (col.type === "dropdown" && product.specs) {
            const match = Object.entries(product.specs).find(
              ([k]) =>
                k.toLowerCase() === col.key.toLowerCase() ||
                k.toLowerCase() === col.label.toLowerCase(),
            );
            if (match) cells[col.key] = String(match[1]);
          }
        }
        // When a specific rate-table option is chosen, mirror it onto matching dropdown columns
        if (variant) {
          for (const col of columns) {
            if (col.type === "dropdown" && !col.lookupProductId) {
              const opts = col.options || [];
              if (opts.some((o) => String(o).toLowerCase() === String(variant).toLowerCase())) {
                cells[col.key] = variant;
              }
            }
          }
        }
        return {
          ...r,
          cells,
          catalogueProductId: productId,
          catalogueLinks: links,
          catalogueVariants: variants,
        };
      }),
    );
    setCatalogueSearch((s) => ({ ...s, [rowId + colKey]: "" }));
    setAdded(false);
    toast.success(
      productId
        ? variant
          ? `Linked “${product.name}” · ${variant} — syncs product + that dropdown row`
          : `Linked “${product.name}” — price will stay in sync with the catalogue`
        : `Linked “${product.name}”`,
    );
  }

  function transferToQuote() {
    if (!onAddToQuote) return;
    const invalid = calculated.find((r) => Object.keys(r.errors).length);
    if (invalid) {
      const first = Object.values(invalid.errors)[0];
      return toast.error(first || "Fix formula errors first.");
    }
    const valid = calculated.filter((r) => {
      const desc =
        r.cells.DESCRIPTION ??
        Object.values(r.cells).find((v) => typeof v === "string" && String(v).trim());
      return desc && r.amount !== 0;
    });
    if (!valid.length) return toast.error("Add at least one priced item.");

    valid.forEach((r) => {
      const description = String(
        r.cells.DESCRIPTION ?? r.cells[columns.find((c) => c.type === "text")?.key ?? ""] ?? "Item",
      ).trim();
      const qty = Number(r.cells.QTY ?? 1) || 1;
      const unit = String(r.cells.UNIT ?? "item");
      const rate = Number(r.cells.RATE ?? r.amount / qty) || 0;
      const sizeMeta: Record<string, string | number> = {};
      for (const col of columns) {
        if (col.type === "dropdown" || col.type === "number") {
          const v = r.cells[col.key];
          if (v !== null && v !== "" && v !== undefined) sizeMeta[col.key] = v as string | number;
        }
      }
      onAddToQuote({
        line_id: uid("LI"),
        description,
        qty,
        unit,
        rate,
        amount: r.amount,
        customized: true,
        source_product_id: r.catalogueProductId,
        meta: {
          calculator: "advanced-spreadsheet",
          columns: columns.map((c) => ({ key: c.key, type: c.type, formula: c.formula })),
          formulas: r.formulas || {},
          sizes: sizeMeta,
          cells: r.cells as Record<string, string | number | null>,
        },
      });
    });
    setAdded(true);
    toast.success(`${valid.length} item(s) added to quotation.`);
  }

  function transferToProduct() {
    if (!onAddToProduct) return;
    const invalid = calculated.find((r) => Object.keys(r.errors).length);
    if (invalid) return toast.error("Fix formula errors first.");
    if (!calculated.length) return toast.error("Add at least one row.");

    // Store which fields stay unlocked for later editing
    const unlocked = columns
      .filter((c) => c.editableByQuoter && !(c.type === "dropdown" && c.sizeLocked) && c.type !== "formula")
      .map((c) => ({
        key: c.key,
        label: c.label,
        type: c.type,
        unit: c.unit,
        options: c.options,
        lookupProductId: c.lookupProductId,
        lookupMatchKey: c.lookupMatchKey,
        lookupFillKeys: c.lookupFillKeys,
        subProducts: c.subProducts,
        subColumns: c.subColumns,
      }));

    const columnMeta = columns.map((c) => ({
      key: c.key,
      label: c.label,
      type: c.type,
      formula: c.formula,
      editableByQuoter: !!c.editableByQuoter,
      unit: c.unit,
      sizeLocked: !!c.sizeLocked,
      options: c.options,
      lookupProductId: c.lookupProductId,
      lookupMatchKey: c.lookupMatchKey,
      lookupFillKeys: c.lookupFillKeys,
      lookupOption: c.lookupOption,
      subProducts: c.subProducts,
      subColumns: c.subColumns,
    }));

    const catalogueRateKey =
      columns.find((c) => c.key === "RATE")?.key ||
      columns.find((c) => c.type === "number" && c.key !== "QTY")?.key ||
      "RATE";

    const descKey =
      columns.find((c) => c.key === "DESCRIPTION")?.key ||
      columns.find((c) => c.type === "text")?.key;

    const unitKey = columns.find((c) => c.key === "UNIT")?.key;

    function resolveCatalogueId(r: (typeof calculated)[number]) {
      if (r.catalogueProductId) return r.catalogueProductId;
      for (const col of columns) {
        if (col.type !== "catalogue") continue;
        const v = String(r.cells[col.key] || "");
        if (v && catalogueProducts.some((p) => p.product_id === v)) return v;
      }
      return undefined;
    }

    /** One catalogue product payload from a single grid row (final product on that row). */
    function payloadForRow(
      r: (typeof calculated)[number],
      index: number,
      batchCount: number,
      /** When editing, persist the full multi-row grid on the product. */
      persistAllRows: boolean,
    ) {
      const rowName = String(r.cells[descKey || "DESCRIPTION"] ?? "").trim();
      const baseName = localProductName.trim() || productName || "";
      const description =
        (persistAllRows ? baseName || rowName : rowName || (batchCount > 1 && baseName ? `${baseName} (${index + 1})` : baseName)) ||
        `Custom product ${index + 1}`;
      const unit =
        localUnit.trim() ||
        String((unitKey ? r.cells[unitKey] : r.cells.UNIT) ?? "item") ||
        "item";
      const cost = persistAllRows ? total : Number(r.amount) || 0;
      const specs: Record<string, string | number> = {};
      for (const col of columns) {
        if (col.type === "formula") continue;
        if (col.key === "DESCRIPTION" || col.key === "UNIT") continue;
        const v = r.cells[col.key];
        if (v !== null && v !== "" && v !== undefined) {
          specs[col.key.toLowerCase()] = v as string | number;
        }
      }
      const sku =
        !persistAllRows && batchCount > 1 && localSku.trim()
          ? `${localSku.trim()}-${index + 1}`
          : localSku.trim();
      const rowList = persistAllRows
        ? calculated.map((row) => ({
            cells: row.cells,
            formulas: row.formulas,
            amount: row.amount,
            catalogueProductId: row.catalogueProductId,
            catalogueLinks: row.catalogueLinks,
          }))
        : [
            {
              cells: r.cells,
              formulas: r.formulas,
              amount: r.amount,
              catalogueProductId: r.catalogueProductId,
              catalogueLinks: r.catalogueLinks,
            },
          ];
      return {
        description,
        unit,
        cost_price: cost,
        selling_price: cost,
        customizer_shared: shareAcrossBusinesses,
        specs,
        meta: {
          calculator: "advanced-spreadsheet",
          columns: columnMeta,
          rateTable: calculated.map((row) => ({ ...row.cells })),
          rows: rowList,
          total: cost,
          unlocked,
          sku,
          category: localCategory,
          catalogueProductId: resolveCatalogueId(r),
          catalogueLinks: r.catalogueLinks,
          catalogueVariants: r.catalogueVariants,
          catalogueRateKey,
          batchIndex: index,
          batchCount,
        },
      };
    }

    // Edit mode: update the single product (all rows kept as its rate table / grid)
    if (isEditing) {
      const primary = calculated[0];
      const description =
        localProductName.trim() ||
        productName ||
        String(primary.cells.DESCRIPTION ?? "").trim() ||
        "Custom product";
      if (!description.trim()) return toast.error("Enter a product name.");
      onAddToProduct(payloadForRow(primary, 0, 1, true));
      setAdded(true);
      setSaved(true);
      toast.success(`“${description}” updated.`);
      return;
    }

    // Create mode: each grid row becomes its own final product in the catalogue
    const valid = calculated.filter((r) => {
      const rowName = String(r.cells[descKey || "DESCRIPTION"] ?? "").trim();
      return Boolean(rowName || localProductName.trim() || productName);
    });
    if (!valid.length) {
      return toast.error(
        "Enter a product name above, or put a name in each row’s Description cell.",
      );
    }

    valid.forEach((r, index) => {
      onAddToProduct!(payloadForRow(r, index, valid.length, false));
    });
    setAdded(true);
    setSaved(true);
    toast.success(
      valid.length === 1
        ? `“${payloadForRow(valid[0], 0, 1, false).description}” saved to product catalogue.`
        : `${valid.length} products saved to catalogue (one final product per row).`,
    );
  }

  /**
   * Fields shown on the edit card.
   * Creators see all non-formula columns (including locked dropdowns) so they can set defaults.
   * Quoters only see unlocked fields.
   */
  const unlockedColumns = useMemo(
    () =>
      columns.filter((c) => {
        if (c.type === "formula") return false;
        if (isCreator) return true; // creator may edit locked data
        return c.editableByQuoter && !(c.type === "dropdown" && c.sizeLocked);
      }),
    [columns, isCreator],
  );

  const filteredProducts = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.category && p.category.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  };

  return (
    <Card className="mb-4 space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-leaf/50 p-2">
            <Calculator className="size-5" />
          </div>
          <div>
            <p className="font-semibold">Spreadsheet product builder</p>
            <p className="text-xs text-ink-muted">
              Excel-style grid: each row can be a final product. Add rows, cost them, then save — one
              catalogue product is created per row. Lock dropdowns you do not want edited later.
              Unlocked fields appear on a card for editing.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="mr-1 size-4" />
            Preview product
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowColumnEditor((v) => !v)}
          >
            <Columns3 className="mr-1 size-4" />
            {showColumnEditor ? "Hide columns" : "Columns"}
          </Button>
        </div>
      </div>

      {showColumnEditor && (
        <div className="space-y-3 rounded-lg border border-ink/10 bg-canvas/60 p-3">
          <p className="text-xs font-medium text-ink-muted">Column definitions</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="p-1.5">Label</th>
                  <th className="p-1.5">Key</th>
                  <th className="p-1.5">Type</th>
                  <th className="p-1.5">Unit</th>
                  <th className="p-1.5">Formula</th>
                  <th className="p-1.5" title="Quoter may edit">
                    Editable
                  </th>
                  {isCreator && <th className="p-1.5">Lock</th>}
                  <th className="p-1.5">Dropdown choices + product</th>
                  <th className="p-1.5" />
                </tr>
              </thead>
              <tbody>
                {columns.map((col) => (
                  <tr key={col.id} className="border-t border-ink/5">
                    <td className="p-1">
                      <Input
                        className="min-w-28 h-8"
                        value={col.label}
                        onChange={(e) => updateColumnMeta(col.id, { label: e.target.value })}
                        disabled={!isCreator && col.type === "formula"}
                      />
                    </td>
                    <td className="p-1 font-mono text-xs text-ink-muted">{col.key}</td>
                    <td className="p-1">
                      <Select
                        className="h-8 text-xs"
                        value={col.type}
                        disabled={!isCreator}
                        onChange={(e) => {
                          const nextType = e.target.value as ColumnType;
                          const nextFormula =
                            nextType === "formula"
                              ? col.formula || "=QTY*RATE"
                              : undefined;
                          updateColumnMeta(col.id, {
                            type: nextType,
                            formula: nextFormula,
                            editableByQuoter:
                              nextType === "formula" ? true : col.editableByQuoter,
                            options: nextType === "dropdown" ? col.options || [] : col.options,
                            subProducts: nextType === "subproduct" ? col.subProducts || [] : col.subProducts,
                            subColumns: nextType === "subproduct" ? col.subColumns || [] : col.subColumns,
                            sizeLocked: nextType === "dropdown" ? col.sizeLocked ?? false : undefined,
                          });
                          if (nextType === "formula") {
                            setRows((rs) =>
                              rs.map((r) => ({
                                ...r,
                                cells: { ...r.cells, [col.key]: null },
                                formulas: {
                                  ...(r.formulas || {}),
                                  [col.key]:
                                    r.formulas?.[col.key] || nextFormula || "=0",
                                },
                              })),
                            );
                          }
                        }}
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="dropdown">Dropdown</option>
                        <option value="catalogue">Catalogue</option>
                        <option value="subproduct">Sub-products</option>
                        <option value="formula">Formula</option>
                      </Select>
                    </td>
                    <td className="p-1">
                      <Input
                        className="w-20 h-8"
                        value={col.unit || ""}
                        placeholder="—"
                        onChange={(e) => updateColumnMeta(col.id, { unit: e.target.value })}
                      />
                    </td>
                    <td className="p-1">
                      {col.type === "formula" ? (
                        <Input
                          className="min-w-36 h-8 font-mono text-xs"
                          value={col.formula || ""}
                          onChange={(e) => {
                            const next = e.target.value;
                            const prev = col.formula || "";
                            updateColumnMeta(col.id, { formula: next });
                            // Propagate default to rows still using the previous default
                            setRows((rs) =>
                              rs.map((r) => {
                                const current = r.formulas?.[col.key];
                                if (current && current !== prev && current !== (prev || "=QTY*RATE")) {
                                  return r;
                                }
                                return {
                                  ...r,
                                  formulas: { ...(r.formulas || {}), [col.key]: next },
                                };
                              }),
                            );
                          }}
                          placeholder="=QTY*RATE"
                          title="Default formula for new rows; also updates rows still on the previous default"
                        />
                      ) : (
                        <span className="text-xs text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="p-1 text-center">
                      <input
                        type="checkbox"
                        checked={col.editableByQuoter}
                        disabled={col.type === "formula"}
                        onChange={() => toggleEditable(col.id)}
                        title="Allow quoter to edit"
                      />
                    </td>
                    {isCreator && (
                      <td className="p-1 text-center">
                        {col.type === "dropdown" ? (
                          <input
                            type="checkbox"
                            checked={!!col.sizeLocked}
                            onChange={() => toggleSizeLock(col.id)}
                            title="Lock dropdown — quoter cannot change"
                          />
                        ) : (
                          <span className="text-xs text-ink-faint">—</span>
                        )}
                      </td>
                    )}
                    <td className="p-1">
                      {col.type === "subproduct" && isCreator ? (
                        <SubProductEditor
                          value={col.subProducts || []}
                          subColumns={col.subColumns || []}
                          onChange={(patch) => updateColumnMeta(col.id, patch)}
                          catalogue={catalogueProducts as Array<{ product_id?: string; name: string; selling_price?: number }>}
                          sheetColumnKeys={columns
                            .filter((c) => c.type !== "formula" && c.id !== col.id)
                            .map((c) => c.key)}
                        />
                      ) : null}
                      {col.type === "dropdown" && isCreator ? (
                        <div className="flex min-w-[280px] flex-col gap-1.5 rounded-md border border-forest/20 bg-leaf/10 p-2">
                          <label className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                            Dropdown choices
                          </label>
                          {(col.options || []).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {(col.options || []).map((opt) => (
                                <span
                                  key={opt}
                                  className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-xs shadow-border"
                                >
                                  {opt}
                                  <button
                                    type="button"
                                    className="text-ink-muted hover:text-clay"
                                    title={`Remove ${opt}`}
                                    onClick={() =>
                                      updateColumnMeta(col.id, {
                                        options: (col.options || []).filter((o) => o !== opt),
                                      })
                                    }
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-ink-muted">No choices yet</p>
                          )}
                          <div className="flex gap-1">
                            <Input
                              className="h-8 flex-1 text-xs"
                              value={newOptionText[col.id] || ""}
                              placeholder="Type one choice e.g. MS"
                              title="Type a single choice, then Add (or press Enter). No commas needed."
                              onChange={(e) =>
                                setNewOptionText((d) => ({ ...d, [col.id]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const text = (newOptionText[col.id] || "").trim();
                                  if (!text) return;
                                  const existing = col.options || [];
                                  if (existing.some((o) => o.toLowerCase() === text.toLowerCase())) {
                                    toast.error(`“${text}” is already a choice`);
                                    return;
                                  }
                                  updateColumnMeta(col.id, { options: [...existing, text] });
                                  setNewOptionText((d) => ({ ...d, [col.id]: "" }));
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-8 shrink-0 px-2"
                              onClick={() => {
                                const text = (newOptionText[col.id] || "").trim();
                                if (!text) {
                                  toast.error("Type a choice first");
                                  return;
                                }
                                const existing = col.options || [];
                                if (existing.some((o) => o.toLowerCase() === text.toLowerCase())) {
                                  toast.error(`“${text}” is already a choice`);
                                  return;
                                }
                                updateColumnMeta(col.id, { options: [...existing, text] });
                                setNewOptionText((d) => ({ ...d, [col.id]: "" }));
                              }}
                            >
                              Add
                            </Button>
                          </div>
                          <p className="text-[10px] text-ink-muted">
                            Add one choice at a time (MS → Add, GI → Add, …). No commas.
                          </p>
                          <label className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                            Add product (rate source)
                          </label>
                          <Select
                            className="h-8 text-xs"
                            value={col.lookupProductId || ""}
                            title="When user picks MS/GI/…, copy RATE and DENSITY from this product"
                            onChange={(e) =>
                              updateColumnMeta(col.id, {
                                lookupProductId: e.target.value || undefined,
                                lookupMatchKey: col.lookupMatchKey || col.key,
                                lookupFillKeys: col.lookupFillKeys?.length
                                  ? col.lookupFillKeys
                                  : ["RATE", "DENSITY"],
                              })
                            }
                          >
                            <option value="">— Select product —</option>
                            {catalogueProducts.length === 0 ? (
                              <option value="" disabled>
                                No products yet — save Product 1 first
                              </option>
                            ) : (
                              catalogueProducts.map((p) => {
                                const id =
                                  "product_id" in p && p.product_id
                                    ? String(p.product_id)
                                    : String((p as { product_id?: string }).product_id || p.name);
                                const name = p.name || id;
                                const hasTable = Boolean(
                                  (p as Product).customizer?.rateTable?.length,
                                );
                                return (
                                  <option key={id} value={id}>
                                    {name}
                                    {hasTable ? " (has rates)" : ""}
                                  </option>
                                );
                              })
                            )}
                          </Select>
                          {col.lookupProductId ? (
                            <>
                              {(() => {
                                const src = catalogueProducts.find(
                                  (p) =>
                                    ("product_id" in p && p.product_id === col.lookupProductId) ||
                                    (p as { product_id?: string }).product_id === col.lookupProductId,
                                ) as Product | undefined;
                                const opts = listProductRateOptions(src);
                                if (!opts.length) return null;
                                return (
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                                      Specific dropdown / rate row (optional)
                                    </label>
                                    <Select
                                      className="h-8 text-xs"
                                      value={col.lookupOption || ""}
                                      title="Sync this product and a specific option from its rate table"
                                      onChange={(e) =>
                                        updateColumnMeta(col.id, {
                                          lookupOption: e.target.value || undefined,
                                        })
                                      }
                                    >
                                      <option value="">— Entire product (all rows) —</option>
                                      {opts.map((o) => (
                                        <option key={o.value} value={o.value}>
                                          {o.label}
                                          {o.rate !== undefined ? ` · ${o.rate}` : ""}
                                        </option>
                                      ))}
                                    </Select>
                                    <p className="text-[10px] text-ink-muted">
                                      Choose a built product list option (e.g. MS) to sync that row’s rates, or leave as entire product.
                                    </p>
                                  </div>
                                );
                              })()}
                              <label className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                                Fields to copy (one at a time optional)
                              </label>
                              <div className="flex flex-wrap gap-1">
                                {(col.lookupFillKeys || ["RATE", "DENSITY"]).map((k) => (
                                  <span
                                    key={k}
                                    className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-xs shadow-border"
                                  >
                                    {k}
                                    <button
                                      type="button"
                                      className="text-ink-muted hover:text-clay"
                                      onClick={() => {
                                        const next = (col.lookupFillKeys || ["RATE", "DENSITY"]).filter(
                                          (x) => x !== k,
                                        );
                                        updateColumnMeta(col.id, {
                                          lookupFillKeys: next.length ? next : ["RATE"],
                                        });
                                      }}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                              <div className="flex gap-1">
                                <Input
                                  className="h-8 flex-1 text-xs"
                                  value={fillKeysDraft[col.id] || ""}
                                  placeholder="e.g. RATE"
                                  onChange={(e) =>
                                    setFillKeysDraft((d) => ({ ...d, [col.id]: e.target.value }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      const text = (fillKeysDraft[col.id] || "").trim();
                                      if (!text) return;
                                      const existing = col.lookupFillKeys || ["RATE", "DENSITY"];
                                      if (existing.some((x) => x.toUpperCase() === text.toUpperCase())) {
                                        setFillKeysDraft((d) => ({ ...d, [col.id]: "" }));
                                        return;
                                      }
                                      updateColumnMeta(col.id, {
                                        lookupFillKeys: [...existing, text],
                                      });
                                      setFillKeysDraft((d) => ({ ...d, [col.id]: "" }));
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="h-8 shrink-0 px-2"
                                  onClick={() => {
                                    const text = (fillKeysDraft[col.id] || "").trim();
                                    if (!text) return;
                                    const existing = col.lookupFillKeys || ["RATE", "DENSITY"];
                                    if (existing.some((x) => x.toUpperCase() === text.toUpperCase())) {
                                      setFillKeysDraft((d) => ({ ...d, [col.id]: "" }));
                                      return;
                                    }
                                    updateColumnMeta(col.id, {
                                      lookupFillKeys: [...existing, text],
                                    });
                                    setFillKeysDraft((d) => ({ ...d, [col.id]: "" }));
                                  }}
                                >
                                  Add
                                </Button>
                              </div>
                            </>
                          ) : (
                            <p className="text-[10px] text-ink-muted">
                              Choose a product to pull RATE / DENSITY when a choice is selected.
                            </p>
                          )}
                        </div>
                      ) : col.type === "dropdown" ? (
                        <span className="text-xs text-ink-muted">
                          {(col.options || []).join(", ") || "—"}
                          {col.lookupProductId ? " · product linked" : ""}
                        </span>
                      ) : col.type === "subproduct" && isCreator ? null : (
                        <span className="text-xs text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="p-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => removeColumn(col.id)}
                        disabled={!isCreator && columns.length <= 4}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end gap-2 border-t border-ink/10 pt-3">
            <Field label="New column label" className="min-w-[140px]">
              <Input
                value={newColLabel}
                onChange={(e) => setNewColLabel(e.target.value)}
                placeholder="e.g. Finish"
              />
            </Field>
            <Field label="Type" className="w-36">
              <Select
                value={newColType}
                onChange={(e) => setNewColType(e.target.value as ColumnType)}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="dropdown">Dropdown</option>
                <option value="catalogue">Catalogue</option>
                <option value="subproduct">Sub-products</option>
                <option value="formula">Formula</option>
              </Select>
            </Field>
            <Field label="Unit" className="w-24">
              <Input
                value={newColUnit}
                onChange={(e) => setNewColUnit(e.target.value)}
                placeholder="mm"
              />
            </Field>
            {newColType === "formula" && (
              <Field label="Formula" className="min-w-[160px]">
                <Input
                  className="font-mono"
                  value={newColFormula}
                  onChange={(e) => setNewColFormula(e.target.value)}
                  placeholder="=QTY*RATE"
                />
              </Field>
            )}
            <Button type="button" onClick={addColumn}>
              <Plus className="mr-1 size-4" /> Add column
            </Button>
          </div>
          <p className="text-xs text-ink-muted">
            Formula columns work like the Excel calculator: set a default formula on the column,
            then edit each row&apos;s formula in the grid (e.g. <code>=QTY*RATE</code>,{" "}
            <code>=IF(QTY&gt;10,RATE*0.9,RATE)</code>, <code>=SINDEG(ANGLE)*LENGTH</code>).
            Supports + − × ÷, parentheses, <code>SIN/COS/TAN</code> (degrees),{" "}
            <code>SINRAD/COSRAD/TANRAD</code> (radians), <code>IF(cond,then,else)</code>,{" "}
            <code>AND/OR/NOT</code>, <code>ASIN/ACOS/ATAN/ATAN2</code> (inverse trig, result in degrees; <code>ASINRAD</code> etc. for radians), <code>ABS/SQRT/MIN/MAX/ROUND</code>, <code>PI()</code>.
            Catalogue columns pick products for rate/description. Dropdown columns use text choices
            you define (comma-separated) and can be locked by the product creator.
          </p>
        </div>
      )}

      {/* Product identity — saved into catalogue */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label={isEditing ? "Product name" : "Product name (or use Description per row)"}
          className="mb-0 sm:col-span-2"
        >
          <Input
            value={localProductName}
            onChange={(e) => {
              setLocalProductName(e.target.value);
              setSaved(false);
            }}
            placeholder={
              isEditing
                ? "e.g. Custom mild steel frame"
                : "Shared name, or leave blank and name each row in Description"
            }
          />
        </Field>
        <Field label="Unit" className="mb-0">
          <Input
            value={localUnit}
            onChange={(e) => setLocalUnit(e.target.value)}
            placeholder="item / m / kg"
          />
        </Field>
        <Field label="SKU (optional)" className="mb-0">
          <Input
            value={localSku}
            onChange={(e) => setLocalSku(e.target.value)}
            placeholder="SKU-001"
          />
        </Field>
        <Field label="Category label (optional)" className="mb-0 sm:col-span-2">
          <Input
            value={localCategory}
            onChange={(e) => setLocalCategory(e.target.value)}
            placeholder="e.g. Fabrication"
          />
        </Field>
        {isCreator && onAddToProduct ? (
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-ink/10 bg-paper px-3 py-2 sm:col-span-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={shareAcrossBusinesses}
              onChange={(e) => {
                setShareAcrossBusinesses(e.target.checked);
                setSaved(false);
              }}
            />
            <span className="text-sm">
              <span className="font-medium">Allow other businesses to use this product in quotations</span>
              <span className="block text-xs text-ink-muted">
                {shareAcrossBusinesses
                  ? "Shared: any business on LifeBoost can pick this product in a quotation and change its unlocked fields. They see its columns, formulas and rates, never your cost price."
                  : "Private: only your own business can use this product in quotations."}
              </span>
            </span>
          </label>
        ) : null}
      </div>

      {/* Card of unlocked cells for editing */}
      <Card className="space-y-3 border-forest/20 bg-leaf/20 p-4 shadow-none">
        <div className="flex items-start gap-2">
          <Package className="mt-0.5 size-4 shrink-0 text-forest" />
          <div>
            <p className="text-sm font-semibold">
              {isCreator ? "Product fields (creator can edit locked data)" : "Unlocked fields (editable)"}
            </p>
            <p className="text-xs text-ink-muted">
              {isCreator
                ? "Set default values including locked dropdowns. Locked dropdowns stay fixed for quoters later."
                : "These cells stay editable after the product is saved. Lock dropdown columns in Columns if they must not change."}
            </p>
          </div>
        </div>
        {unlockedColumns.length === 0 ? (
          <p className="text-xs text-ink-muted">
            No unlocked fields yet. Mark columns as Editable (and unlock dropdowns) in Columns.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unlockedColumns.map((col) => {
              const primary = calculated[0];
              const value = primary?.cells[col.key];
              const isDropdown = col.type === "dropdown";
              const dropdownOptions = col.options || [];
              const isNumeric = col.type === "number";
              return (
                <div
                  key={col.id}
                  className="rounded-md border border-ink/10 bg-paper px-3 py-2"
                >
                  <label className="mb-1 block text-xs text-ink-muted">
                    {col.label}
                    {col.unit ? ` (${col.unit})` : ""}
                    {isDropdown && col.sizeLocked ? (
                      <span className="ml-1 text-[10px] text-amber-700">locked for quoters</span>
                    ) : null}
                  </label>
                  {isDropdown ? (
                    <Select
                      className="h-9"
                      value={value === null || value === undefined ? "" : String(value)}
                      onChange={(e) => {
                        if (!primary) return;
                        updateCell(primary.id, col.key, e.target.value);
                        setSaved(false);
                      }}
                    >
                      <option value="">Select…</option>
                      {dropdownOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                          {col.unit ? ` ${col.unit}` : ""}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      className="h-9"
                      type={isNumeric ? "number" : "text"}
                      min={isNumeric ? 0 : undefined}
                      value={value === null || value === undefined ? "" : String(value)}
                      onChange={(e) => {
                        if (!primary) return;
                        const raw = e.target.value;
                        if (isNumeric) {
                          updateCell(primary.id, col.key, raw === "" ? 0 : Number(raw));
                        } else {
                          updateCell(primary.id, col.key, raw);
                        }
                        setSaved(false);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-ink/10 pt-2 text-sm">
          <span className="text-ink-muted">Live costing</span>
          <span className="font-semibold tabular-nums">{money(total)}</span>
        </div>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-ink/10">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-canvas text-left">
              {columns.map((col) => (
                <th
                  key={col.id}
                  className="border-b border-ink/10 p-2 font-medium whitespace-nowrap"
                >
                  {col.label}
                  {col.unit ? (
                    <span className="ml-1 font-normal text-ink-muted">({col.unit})</span>
                  ) : null}
                  {col.type === "dropdown" && col.sizeLocked ? (
                    <span
                      className="ml-1 text-[10px] text-amber-700"
                      title="Locked — only the product creator can edit"
                    >
                      🔒
                    </span>
                  ) : null}
                  {col.type === "formula" ? (
                    <span className="ml-1 text-[10px] text-ink-faint">ƒ</span>
                  ) : null}
                </th>
              ))}
              <th className="border-b border-ink/10 p-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {calculated.map((row) => (
              <tr key={row.id}>
                {columns.map((col) => {
                  const editable = canEditColumn(col);
                  const err = row.errors[col.key];
                  const value = row.cells[col.key];

                  if (col.type === "formula") {
                    const formulaText =
                      row.formulas?.[col.key] ?? col.formula ?? "=0";
                    // Creators always edit formulas; quoters can if column allows
                    const formulaEditable = isCreator || col.editableByQuoter;
                    return (
                      <td
                        key={col.id}
                        className="border-b border-ink/10 p-1 min-w-[160px]"
                      >
                        <Input
                          className="min-w-40 h-8 font-mono text-xs"
                          value={formulaText}
                          disabled={!formulaEditable}
                          placeholder="=QTY*RATE"
                          onChange={(e) => updateFormula(row.id, col.key, e.target.value)}
                          title="Excel-style formula. Use column keys e.g. QTY, RATE, SIZE"
                        />
                        <p className="px-1 pt-0.5 text-right text-sm font-medium tabular-nums">
                          {money(Number(value ?? 0))}
                        </p>
                        {err ? <p className="px-1 text-xs text-red-600">{err}</p> : null}
                      </td>
                    );
                  }

                  if (col.type === "catalogue") {
                    const search = catalogueSearch[row.id + col.key] ?? "";
                    const matches = filteredProducts(search);
                    const linkedId = row.catalogueLinks?.[col.key];
                    const linked = linkedId
                      ? catalogueProducts.find((p) => (p as Product).product_id === linkedId)
                      : undefined;
                    const linkedVariant = row.catalogueVariants?.[col.key] || "";
                    const rateOpts = listProductRateOptions(linked as Product | undefined);
                    return (
                      <td
                        key={col.id}
                        className="border-b border-ink/10 p-1 relative min-w-[180px]"
                      >
                        <Input
                          className="h-8"
                          placeholder="Search catalogue…"
                          value={search || linked?.name || ""}
                          disabled={!editable}
                          onChange={(e) => {
                            // Typing only searches; the cell value comes from the picked product.
                            setCatalogueSearch((s) => ({ ...s, [row.id + col.key]: e.target.value }));
                          }}
                        />
                        <p className="px-1 pt-0.5 text-right text-sm font-medium tabular-nums">
                          {linked ? money(Number(value ?? 0)) : "—"}
                          {linked ? (
                            <span className="ml-1 text-xs font-normal text-ink-muted">
                              synced
                              {linkedVariant ? ` · ${linkedVariant}` : ""}
                            </span>
                          ) : null}
                        </p>
                        {editable && linked && rateOpts.length > 0 ? (
                          <Select
                            className="mt-1 h-8 text-xs"
                            value={linkedVariant}
                            title="Sync product and a specific dropdown / rate-table row"
                            onChange={(e) => {
                              const v = e.target.value;
                              pickCatalogue(row.id, col.key, linked as Product, v || undefined);
                            }}
                          >
                            <option value="">Entire product</option>
                            {rateOpts.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                                {o.rate !== undefined ? ` · ${o.rate}` : ""}
                              </option>
                            ))}
                          </Select>
                        ) : null}
                        {editable && search.trim() && matches.length > 0 && (
                          <ul className="absolute z-20 mt-0.5 max-h-48 w-72 overflow-auto rounded-md border border-ink/15 bg-white shadow-lg text-xs">
                            {matches.map((p) => {
                              const opts = listProductRateOptions(p as Product);
                              const id = "product_id" in p ? p.product_id : p.name;
                              return (
                                <li key={id} className="border-b border-ink/5 last:border-0">
                                  <button
                                    type="button"
                                    className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-leaf/40"
                                    onClick={() => {
                                      pickCatalogue(row.id, col.key, p);
                                    }}
                                  >
                                    <span className="truncate font-medium">{p.name}</span>
                                    <span className="shrink-0 tabular-nums text-ink-muted">
                                      {money(p.selling_price)}
                                    </span>
                                  </button>
                                  {opts.length ? (
                                    <div className="flex flex-wrap gap-1 px-2 pb-1.5">
                                      {opts.slice(0, 8).map((o) => (
                                        <button
                                          key={o.value}
                                          type="button"
                                          className="rounded-full bg-leaf/40 px-2 py-0.5 text-[10px] hover:bg-leaf"
                                          title={`Link ${p.name} · ${o.label}`}
                                          onClick={() => {
                                            pickCatalogue(row.id, col.key, p, o.value);
                                          }}
                                        >
                                          {o.label}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </td>
                    );
                  }

                  if (col.type === "subproduct") {
                    return (
                      <td key={col.id} className="border-b border-ink/10 p-1 min-w-[160px]">
                        <SubProductPicker
                          tree={col.subProducts}
                          value={String(value ?? "")}
                          disabled={!editable}
                          onChange={(label) => setSubProduct(row.id, col, label)}
                        />
                      </td>
                    );
                  }

                  const isDropdown = col.type === "dropdown";
                  const dropdownOptions = col.options || [];
                  const isNumeric = col.type === "number";
                  if (isDropdown) {
                    return (
                      <td key={col.id} className="border-b border-ink/10 p-1">
                        <Select
                          className="h-8 min-w-28"
                          value={value === null || value === undefined ? "" : String(value)}
                          disabled={!editable}
                          onChange={(e) => {
                            updateCell(row.id, col.key, e.target.value);
                          }}
                        >
                          <option value="">Select…</option>
                          {dropdownOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </Select>
                      </td>
                    );
                  }
                  return (
                    <td key={col.id} className="border-b border-ink/10 p-1">
                      <Input
                        className={isNumeric ? "w-24 h-8" : "min-w-28 h-8"}
                        type={isNumeric ? "number" : "text"}
                        min={isNumeric ? 0 : undefined}
                        value={value === null || value === undefined ? "" : String(value)}
                        disabled={!editable}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (isNumeric) {
                            updateCell(row.id, col.key, raw === "" ? 0 : Number(raw));
                          } else {
                            updateCell(row.id, col.key, raw);
                          }
                        }}
                      />
                    </td>
                  );
                })}
                <td className="border-b border-ink/10 p-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label="Remove row"
                    onClick={() => {
                      setRows((current) => current.filter((r) => r.id !== row.id));
                      setAdded(false);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setRows((current) => [...current, newRow(columns)]);
            setAdded(false);
          }}
        >
          <Plus className="mr-1 size-4" /> Add row
        </Button>
        <div className="text-right">
          <p className="text-xs text-ink-muted">
            {isEditing
              ? "Combined costing"
              : calculated.length > 1
                ? `${calculated.length} final products (one per row)`
                : "Final product costing"}
          </p>
          <p className="text-lg font-semibold tabular-nums">{money(total)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
          <Eye className="mr-2 size-4" />
          Preview product
        </Button>
        {onAddToProduct && (
          <Button
            type="button"
            className="flex-1 min-w-[200px]"
            onClick={transferToProduct}
            disabled={
              !calculated.length ||
              calculated.some((r) => Object.keys(r.errors).length > 0) ||
              (isEditing && !localProductName.trim())
            }
          >
            <Package className="mr-2 size-4" />
            {saved
              ? "Save again"
              : isEditing
                ? "Save changes to product"
                : calculated.length > 1
                  ? `Save ${calculated.length} products to catalogue`
                  : "Save product to catalogue"}
          </Button>
        )}
      </div>
      {saved ? (
        <p className="text-xs text-forest">
          {isEditing
            ? "Product saved to the catalogue. You can adjust unlocked fields and save again if needed."
            : "Saved to the catalogue (one product per row). You can adjust and save again if needed."}
        </p>
      ) : null}

      {/* Product preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[min(calc(100%-2rem),32rem)] max-h-[min(90dvh,36rem)]">
          <DialogHeader>
            <DialogTitle>Product preview</DialogTitle>
            <DialogDescription>
              How this configuration will look as a product line with sizes and costing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-ink/10 bg-canvas/50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-ink/10 bg-paper">
                  <Package className="size-6 text-forest" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{previewProduct.description}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">Unit: {previewProduct.unit}</p>
                </div>
              </div>

              {previewProduct.specs.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {previewProduct.specs.map((s) => (
                    <div
                      key={s.key}
                      className="rounded-md border border-ink/8 bg-paper px-2.5 py-1.5 text-xs"
                    >
                      <p className="text-ink-muted">{s.label}</p>
                      <p className="font-medium tabular-nums">
                        {s.value}
                        {s.unit ? ` ${s.unit}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {previewProduct.lines.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-ink-muted">Line items</p>
                <ul className="space-y-1.5">
                  {previewProduct.lines.map((line, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-2 rounded-md bg-canvas px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{line.description}</p>
                        <p className="text-xs text-ink-muted">
                          {line.qty} {line.unit} × {money(line.rate)}
                          {line.hasError ? (
                            <span className="ml-1 text-red-600">· formula error</span>
                          ) : null}
                        </p>
                      </div>
                      <p className="shrink-0 font-medium tabular-nums">{money(line.amount)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-ink/10 pt-3">
              <p className="text-sm text-ink-muted">Final product costing</p>
              <p className="text-lg font-semibold tabular-nums">{money(previewProduct.total)}</p>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setPreviewOpen(false)}>
                Close
              </Button>
              {onAddToProduct && (
                <Button
                  type="button"
                  onClick={() => {
                    setPreviewOpen(false);
                    transferToProduct();
                  }}
                  disabled={
                    !calculated.length ||
                    calculated.some((r) => Object.keys(r.errors).length > 0) ||
                    (isEditing && !localProductName.trim())
                  }
                >
                  <Package className="mr-1 size-4" />
                  {isEditing
                    ? "Save changes"
                    : calculated.length > 1
                      ? `Save ${calculated.length} products`
                      : "Save to catalogue"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
