import { useMemo, useState, useCallback } from "react";
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
import type { MarketplaceProduct, QuoteLineItem, Product } from "@/lib/types";

/** Column data types the product creator / quoter can choose. */
export type ColumnType = "text" | "number" | "catalogue" | "formula" | "size";

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
  /** For size columns: whether this size is locked by the product creator. */
  sizeLocked?: boolean;
};

export type CalcCellValue = string | number | null;

export type CalcRow = {
  id: string;
  cells: Record<string, CalcCellValue>;
  /** Per-row formula overrides for formula columns (Excel-style). Falls back to column default. */
  formulas?: Record<string, string>;
  /** When a catalogue column is used, store the matched product for costing. */
  catalogueProductId?: string;
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
function evaluateArithmetic(expression: string): number {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/]/g) ?? [];
  if (tokens.join("") !== expression.replace(/\s/g, "")) {
    throw new Error("Use numbers, +, -, *, / and parentheses only.");
  }
  let index = 0;
  function factor(): number {
    const token = tokens[index++];
    if (token === "+" || token === "-") {
      const n = factor();
      return token === "-" ? -n : n;
    }
    if (token === "(") {
      const n = expressionValue();
      if (tokens[index++] !== ")") throw new Error("Missing closing parenthesis.");
      return n;
    }
    const n = Number(token);
    if (!Number.isFinite(n)) throw new Error("Invalid formula.");
    return n;
  }
  function term(): number {
    let n = factor();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const op = tokens[index++];
      const rhs = factor();
      if (op === "/" && rhs === 0) throw new Error("Cannot divide by zero.");
      n = op === "*" ? n * rhs : n / rhs;
    }
    return n;
  }
  function expressionValue(): number {
    let n = term();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const op = tokens[index++];
      const rhs = term();
      n = op === "+" ? n + rhs : n - rhs;
    }
    return n;
  }
  const result = expressionValue();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error("Invalid formula.");
  return result;
}

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
      key: "SIZE",
      label: "Size",
      type: "size",
      editableByQuoter: true,
      unit: "mm",
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

function newRow(columns: CalcColumn[]): CalcRow {
  const cells: Record<string, CalcCellValue> = {};
  const formulas: Record<string, string> = {};
  for (const col of columns) {
    if (col.type === "number" || col.type === "size") cells[col.key] = col.key === "QTY" ? 1 : 0;
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
  onAddToQuote?: (item: QuoteLineItem) => void;
  /** Called when the creator saves a configuration or produces a costed product line. */
  onAddToProduct?: (payload: {
    description: string;
    unit: string;
    cost_price: number;
    selling_price: number;
    specs: Record<string, string | number>;
    meta: Record<string, unknown>;
  }) => void;
};

export function AdvancedQuotationCalculator({
  products = [],
  mode = "quoter",
  productName,
  onAddToQuote,
  onAddToProduct,
}: Props) {
  const isCreator = mode === "product_creator";
  const [columns, setColumns] = useState<CalcColumn[]>(defaultColumns);
  const [rows, setRows] = useState<CalcRow[]>(() => [newRow(defaultColumns())]);
  const [showColumnEditor, setShowColumnEditor] = useState(false);
  const [newColLabel, setNewColLabel] = useState("");
  const [newColType, setNewColType] = useState<ColumnType>("number");
  const [newColFormula, setNewColFormula] = useState("=QTY*RATE");
  const [newColUnit, setNewColUnit] = useState("");
  const [added, setAdded] = useState(false);
  const [catalogueSearch, setCatalogueSearch] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [localProductName, setLocalProductName] = useState(productName || "");
  const [localUnit, setLocalUnit] = useState("item");
  const [localCategory, setLocalCategory] = useState("");
  const [localSku, setLocalSku] = useState("");
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

  const updateCell = useCallback((rowId: string, key: string, value: CalcCellValue) => {
    setRows((current) =>
      current.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [key]: value } } : r)),
    );
    setAdded(false);
  }, []);

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

  const canEditColumn = (col: CalcColumn) => {
    if (isCreator) return true;
    if (col.type === "size" && col.sizeLocked) return false;
    return col.editableByQuoter;
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
      sizeLocked: newColType === "size" ? false : undefined,
    };
    setColumns((c) => [...c, col]);
    setRows((rs) =>
      rs.map((r) => ({
        ...r,
        cells: {
          ...r.cells,
          [key]:
            newColType === "number" || newColType === "size"
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

  function pickCatalogue(rowId: string, product: MarketplaceProduct | Product) {
    const descKey =
      columns.find((c) => c.key === "DESCRIPTION")?.key ||
      columns.find((c) => c.type === "text")?.key;
    const rateKey =
      columns.find((c) => c.key === "RATE")?.key ||
      columns.find((c) => c.type === "number" && c.key !== "QTY")?.key;
    const unitKey = columns.find((c) => c.key === "UNIT")?.key;

    setRows((current) =>
      current.map((r) => {
        if (r.id !== rowId) return r;
        const cells = { ...r.cells };
        if (descKey) cells[descKey] = product.name;
        if (rateKey) cells[rateKey] = product.selling_price;
        if (unitKey) cells[unitKey] = product.unit || "item";
        for (const col of columns) {
          if (col.type === "size" && product.specs) {
            const match = Object.entries(product.specs).find(
              ([k]) =>
                k.toLowerCase().includes("size") ||
                k.toLowerCase().includes("dia") ||
                k.toLowerCase().includes("bore") ||
                k === col.key.toLowerCase(),
            );
            if (match) cells[col.key] = match[1];
          }
        }
        return {
          ...r,
          cells,
          catalogueProductId: "product_id" in product ? product.product_id : undefined,
        };
      }),
    );
    setCatalogueSearch((s) => ({ ...s, [rowId]: "" }));
    setAdded(false);
    toast.success(`Linked “${product.name}”`);
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
        if (col.type === "size" || col.type === "number") {
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

    const primary = calculated[0];
    const description =
      localProductName.trim() ||
      productName ||
      String(primary.cells.DESCRIPTION ?? "").trim() ||
      "Custom product";
    if (!description.trim()) return toast.error("Enter a product name.");
    const unit = localUnit.trim() || String(primary.cells.UNIT ?? "item");
    const cost = total;
    const specs: Record<string, string | number> = {};
    for (const col of columns) {
      if (col.type === "formula") continue;
      if (col.key === "DESCRIPTION" || col.key === "UNIT") continue;
      const v = primary.cells[col.key];
      if (v !== null && v !== "" && v !== undefined) {
        specs[col.key.toLowerCase()] = v as string | number;
      }
    }
    // Store which fields stay unlocked for later editing
    const unlocked = columns
      .filter((c) => c.editableByQuoter && !(c.type === "size" && c.sizeLocked) && c.type !== "formula")
      .map((c) => ({ key: c.key, label: c.label, type: c.type, unit: c.unit }));
    onAddToProduct({
      description,
      unit,
      cost_price: cost,
      selling_price: cost,
      specs,
      meta: {
        calculator: "advanced-spreadsheet",
        columns,
        rows: calculated.map((r) => ({
          cells: r.cells,
          formulas: r.formulas,
          amount: r.amount,
        })),
        total,
        unlocked,
        sku: localSku,
        category: localCategory,
      },
    });
    setAdded(true);
    setSaved(true);
    toast.success(`“${description}” saved to product catalogue.`);
  }

  /** Columns the creator left unlocked for later editing (sizes, numbers, text). */
  const unlockedColumns = useMemo(
    () =>
      columns.filter(
        (c) =>
          c.type !== "formula" &&
          c.editableByQuoter &&
          !(c.type === "size" && c.sizeLocked),
      ),
    [columns],
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
              Excel-style grid to cost a product, lock sizes you do not want edited later, then save
              the result into your product catalogue. Unlocked fields appear on a card for editing.
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
                  {isCreator && <th className="p-1.5">Lock size</th>}
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
                        <option value="size">Size</option>
                        <option value="catalogue">Catalogue</option>
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
                        {col.type === "size" ? (
                          <input
                            type="checkbox"
                            checked={!!col.sizeLocked}
                            onChange={() => toggleSizeLock(col.id)}
                            title="Lock size — quoter cannot change"
                          />
                        ) : (
                          <span className="text-xs text-ink-faint">—</span>
                        )}
                      </td>
                    )}
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
                placeholder="e.g. Length"
              />
            </Field>
            <Field label="Type" className="w-36">
              <Select
                value={newColType}
                onChange={(e) => setNewColType(e.target.value as ColumnType)}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="size">Size</option>
                <option value="catalogue">Catalogue</option>
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
            <code>=(QTY*RATE)*1.16</code>, <code>=LENGTH*WIDTH*RATE</code>). Supported operators:{" "}
            + − × ÷ and parentheses. Catalogue columns let you pick a product to fill rate and
            description. Size columns can be locked by the product creator so quoters only change
            allowed dimensions.
          </p>
        </div>
      )}

      {/* Product identity — saved into catalogue */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Product name" className="mb-0 sm:col-span-2">
          <Input
            value={localProductName}
            onChange={(e) => {
              setLocalProductName(e.target.value);
              setSaved(false);
            }}
            placeholder="e.g. Custom mild steel frame"
            required
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
      </div>

      {/* Card of unlocked cells for editing */}
      <Card className="space-y-3 border-forest/20 bg-leaf/20 p-4 shadow-none">
        <div className="flex items-start gap-2">
          <Package className="mt-0.5 size-4 shrink-0 text-forest" />
          <div>
            <p className="text-sm font-semibold">Unlocked fields (editable)</p>
            <p className="text-xs text-ink-muted">
              These cells stay editable after the product is saved. Lock size columns in Columns if
              they must not change.
            </p>
          </div>
        </div>
        {unlockedColumns.length === 0 ? (
          <p className="text-xs text-ink-muted">
            No unlocked fields yet. Mark columns as Editable (and unlock sizes) in Columns.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unlockedColumns.map((col) => {
              const primary = calculated[0];
              const value = primary?.cells[col.key];
              const isNumeric = col.type === "number" || col.type === "size";
              return (
                <div
                  key={col.id}
                  className="rounded-md border border-ink/10 bg-paper px-3 py-2"
                >
                  <label className="mb-1 block text-xs text-ink-muted">
                    {col.label}
                    {col.unit ? ` (${col.unit})` : ""}
                  </label>
                  <Input
                    className="h-9"
                    type={isNumeric ? "number" : "text"}
                    min={isNumeric ? 0 : undefined}
                    step={col.type === "size" ? "any" : undefined}
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
                  {col.type === "size" && col.sizeLocked ? (
                    <span
                      className="ml-1 text-[10px] text-amber-700"
                      title="Locked by product creator"
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
                    const search = catalogueSearch[row.id] ?? "";
                    const matches = filteredProducts(search);
                    return (
                      <td
                        key={col.id}
                        className="border-b border-ink/10 p-1 relative min-w-[160px]"
                      >
                        <Input
                          className="h-8"
                          placeholder="Search catalogue…"
                          value={search || String(value ?? "")}
                          disabled={!editable}
                          onChange={(e) => {
                            setCatalogueSearch((s) => ({ ...s, [row.id]: e.target.value }));
                            updateCell(row.id, col.key, e.target.value);
                          }}
                        />
                        {editable && search.trim() && matches.length > 0 && (
                          <ul className="absolute z-20 mt-0.5 max-h-40 w-64 overflow-auto rounded-md border border-ink/15 bg-white shadow-lg text-xs">
                            {matches.map((p) => (
                              <li key={"product_id" in p ? p.product_id : p.name}>
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-leaf/40"
                                  onClick={() => pickCatalogue(row.id, p)}
                                >
                                  <span className="truncate">{p.name}</span>
                                  <span className="shrink-0 tabular-nums text-ink-muted">
                                    {money(p.selling_price)}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    );
                  }

                  const isNumeric = col.type === "number" || col.type === "size";
                  return (
                    <td key={col.id} className="border-b border-ink/10 p-1">
                      <Input
                        className={isNumeric ? "w-24 h-8" : "min-w-28 h-8"}
                        type={isNumeric ? "number" : "text"}
                        min={isNumeric ? 0 : undefined}
                        step={col.type === "size" ? "any" : undefined}
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
          <p className="text-xs text-ink-muted">Final product costing</p>
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
              !localProductName.trim()
            }
          >
            <Package className="mr-2 size-4" />
            {saved ? "Save again to catalogue" : "Save product to catalogue"}
          </Button>
        )}
      </div>
      {saved ? (
        <p className="text-xs text-forest">
          Product saved to the catalogue. You can adjust unlocked fields and save again if needed.
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
                    !localProductName.trim()
                  }
                >
                  <Package className="mr-1 size-4" />
                  Save to catalogue
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
