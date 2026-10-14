import { Copy, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export type ListCategory = { category_id: string; name: string; unit_default: string };
export type ListSpecDef = {
  spec_id: string;
  category_id: string;
  key: string;
  label: string;
  unit: string;
  data_type: string;
};

export type ItemListSubmit = {
  categoryId?: string;
  newCategory?: { name: string; unit?: string };
  newSpecs: { key: string; label: string; unit: string; dataType: "number" | "text" }[];
  rows: {
    family: string;
    name: string;
    sku: string;
    unit: string;
    sellingPrice: string;
    costPrice: string;
    stock: string;
    specs: Record<string, string | number>;
  }[];
};

type Column = { key: string; label: string; unit: string; dataType: "number" | "text"; isNew: boolean };
type Row = {
  id: number;
  family: string;
  name: string;
  sku: string;
  unit: string;
  sellingPrice: string;
  costPrice: string;
  stock: string;
  specs: Record<string, string>;
};

const NEW = "__new__";

function slug(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const cell = "h-9 min-w-24 px-2 text-sm";

/**
 * "Add item list": define a category, its specification columns, then fill a table
 * where every row is one item with a family and spec values. Saved in one go.
 */
export function ItemListBuilder({
  categories,
  specDefs,
  existingFamilies,
  itemKind,
  defaultCategoryId,
  onCancel,
  onSubmit,
}: {
  categories: ListCategory[];
  specDefs: ListSpecDef[];
  existingFamilies: { category_id: string; family: string }[];
  itemKind: "product" | "service";
  defaultCategoryId?: string;
  onCancel: () => void;
  onSubmit: (form: ItemListSubmit) => void;
}) {
  const isService = itemKind === "service";
  const defaultUnit = isService ? "job" : "unit";

  const [categoryId, setCategoryId] = useState(
    defaultCategoryId || (categories.length ? categories[0].category_id : NEW),
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryUnit, setNewCategoryUnit] = useState(defaultUnit);
  const [extraCols, setExtraCols] = useState<Column[]>([]);
  const [colDraft, setColDraft] = useState({ label: "", unit: "", dataType: "number" as "number" | "text" });
  const [nextId, setNextId] = useState(4);
  const blank = (id: number, from?: Row): Row => ({
    id,
    family: from?.family || "",
    name: "",
    sku: "",
    unit: from?.unit || "",
    sellingPrice: "",
    costPrice: "",
    stock: "",
    specs: {},
  });
  const [rows, setRows] = useState<Row[]>([blank(1), blank(2), blank(3)]);
  const [error, setError] = useState("");

  const isNewCategory = categoryId === NEW;
  const selectedCategory = categories.find((c) => c.category_id === categoryId);

  const baseColumns: Column[] = useMemo(
    () =>
      isNewCategory
        ? []
        : specDefs
            .filter((s) => s.category_id === categoryId)
            .map((s) => ({
              key: s.key,
              label: s.label,
              unit: s.unit,
              dataType: s.data_type === "text" ? ("text" as const) : ("number" as const),
              isNew: false,
            })),
    [specDefs, categoryId, isNewCategory],
  );
  const columns = [...baseColumns, ...extraCols];

  const familySuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const f of existingFamilies) {
      if (f.family && (isNewCategory || f.category_id === categoryId)) set.add(f.family);
    }
    for (const r of rows) if (r.family.trim()) set.add(r.family.trim());
    return [...set].sort();
  }, [existingFamilies, categoryId, isNewCategory, rows]);

  function changeCategory(id: string) {
    setCategoryId(id);
    setExtraCols([]);
    // Spec columns belong to the category, so values typed for the old one no longer apply.
    setRows((rs) => rs.map((r) => ({ ...r, specs: {} })));
  }

  function addColumn() {
    const label = colDraft.label.trim();
    if (!label) return;
    const base = slug(label);
    if (!base) {
      setError("Column name needs at least one letter or number.");
      return;
    }
    const taken = new Set(columns.map((c) => c.key));
    let key = base;
    let n = 2;
    while (taken.has(key)) key = `${base}_${n++}`;
    setExtraCols([...extraCols, { key, label, unit: colDraft.unit.trim(), dataType: colDraft.dataType, isNew: true }]);
    setColDraft({ label: "", unit: "", dataType: colDraft.dataType });
    setError("");
  }

  function removeExtraColumn(key: string) {
    setExtraCols((cs) => cs.filter((c) => c.key !== key));
    setRows((rs) =>
      rs.map((r) => {
        const { [key]: _drop, ...rest } = r.specs;
        return { ...r, specs: rest };
      }),
    );
  }

  const patchRow = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const setSpec = (id: number, key: string, value: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, specs: { ...r.specs, [key]: value } } : r)));

  function addRow() {
    setRows((rs) => [...rs, blank(nextId, rs[rs.length - 1])]);
    setNextId(nextId + 1);
  }
  function duplicateRow(row: Row) {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.id === row.id);
      const copy: Row = { ...row, id: nextId, name: "", sku: "", specs: {} };
      return [...rs.slice(0, i + 1), copy, ...rs.slice(i + 1)];
    });
    setNextId(nextId + 1);
  }

  /** Name falls back to "Family + spec values" so a size-only table still saves cleanly. */
  function resolvedName(r: Row) {
    if (r.name.trim()) return r.name.trim();
    const values = columns.map((c) => r.specs[c.key]?.trim()).filter(Boolean);
    return [r.family.trim(), values.join(" × ")].filter(Boolean).join(" ").trim();
  }

  const filledRows = rows.filter((r) => resolvedName(r));

  function submit() {
    if (isNewCategory && !newCategoryName.trim()) {
      setError("Give the new category a name.");
      return;
    }
    if (filledRows.length === 0) {
      setError("Fill in at least one row (a name, a family, or some specification values).");
      return;
    }
    setError("");
    onSubmit({
      categoryId: isNewCategory ? undefined : categoryId,
      newCategory: isNewCategory ? { name: newCategoryName.trim(), unit: newCategoryUnit.trim() || defaultUnit } : undefined,
      newSpecs: extraCols.map((c) => ({ key: c.key, label: c.label, unit: c.unit, dataType: c.dataType })),
      rows: filledRows.map((r) => ({
        family: r.family.trim(),
        name: resolvedName(r),
        sku: r.sku.trim(),
        unit: r.unit.trim() || (isNewCategory ? newCategoryUnit.trim() : selectedCategory?.unit_default) || defaultUnit,
        sellingPrice: r.sellingPrice,
        costPrice: r.costPrice,
        stock: r.stock,
        specs: Object.fromEntries(
          columns.flatMap((c) => {
            const raw = (r.specs[c.key] ?? "").trim();
            if (raw === "") return [];
            return [[c.key, c.dataType === "number" && !Number.isNaN(Number(raw)) ? Number(raw) : raw]];
          }),
        ),
      })),
    });
  }

  return (
    <div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Category">
          <Select value={categoryId} onChange={(e) => changeCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.category_id} value={c.category_id}>
                {c.name}
              </option>
            ))}
            <option value={NEW}>+ New category…</option>
          </Select>
        </Field>
        {isNewCategory ? (
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <Field label="New category name">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Steel pipes"
              />
            </Field>
            <Field label="Unit">
              <Input value={newCategoryUnit} onChange={(e) => setNewCategoryUnit(e.target.value)} />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="mb-4 rounded-lg border border-line bg-canvas p-3">
        <p className="mb-2 text-sm font-medium">Specification columns</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {columns.length === 0 ? (
            <span className="text-xs text-ink-muted">
              None yet. Add the measurements that describe each item (e.g. Nominal bore · mm).
            </span>
          ) : (
            columns.map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-1 text-xs"
              >
                {c.label}
                {c.unit ? <span className="text-ink-muted">({c.unit})</span> : null}
                {c.isNew ? (
                  <button
                    type="button"
                    className="ml-0.5 text-ink-muted hover:text-red-600"
                    onClick={() => removeExtraColumn(c.key)}
                    aria-label={`Remove ${c.label}`}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-ink-muted">Column name</span>
            <Input
              className="h-9 w-44"
              value={colDraft.label}
              onChange={(e) => setColDraft({ ...colDraft, label: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addColumn();
                }
              }}
              placeholder="Outside diameter"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-ink-muted">Unit</span>
            <Input
              className="h-9 w-20"
              value={colDraft.unit}
              onChange={(e) => setColDraft({ ...colDraft, unit: e.target.value })}
              placeholder="mm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-ink-muted">Type</span>
            <Select
              className="h-9 w-28"
              value={colDraft.dataType}
              onChange={(e) => setColDraft({ ...colDraft, dataType: e.target.value as "number" | "text" })}
            >
              <option value="number">Number</option>
              <option value="text">Text</option>
            </Select>
          </label>
          <Button type="button" size="sm" variant="secondary" onClick={addColumn}>
            <Plus className="size-3.5" /> Add column
          </Button>
        </div>
        {!isNewCategory && baseColumns.length > 0 ? (
          <p className="mt-2 text-[11px] text-ink-muted">
            Columns from {selectedCategory?.name} are already included. New ones are added to the category when you save.
          </p>
        ) : null}
      </div>

      <datalist id="item-list-families">
        {familySuggestions.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-canvas text-xs tracking-wide text-ink-muted uppercase">
            <tr>
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Family</th>
              <th className="px-2 py-2 font-medium">Name</th>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-2 font-medium whitespace-nowrap">
                  {c.label}
                  {c.unit ? <span className="font-normal normal-case opacity-70"> ({c.unit})</span> : null}
                </th>
              ))}
              <th className="px-2 py-2 font-medium">Unit</th>
              <th className="px-2 py-2 font-medium">Price</th>
              <th className="px-2 py-2 font-medium">Cost</th>
              {!isService ? <th className="px-2 py-2 font-medium">Stock</th> : null}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-2 py-1.5 text-xs text-ink-muted tabular-nums">{i + 1}</td>
                <td className="px-1 py-1.5">
                  <Input
                    className={`${cell} min-w-36`}
                    list="item-list-families"
                    value={r.family}
                    onChange={(e) => patchRow(r.id, { family: e.target.value })}
                    placeholder="e.g. CHS pipe"
                  />
                </td>
                <td className="px-1 py-1.5">
                  <Input
                    className={`${cell} min-w-40`}
                    value={r.name}
                    onChange={(e) => patchRow(r.id, { name: e.target.value })}
                    placeholder={resolvedName(r) || "Auto from family + specs"}
                  />
                </td>
                {columns.map((c) => (
                  <td key={c.key} className="px-1 py-1.5">
                    <Input
                      className={cell}
                      type={c.dataType === "number" ? "number" : "text"}
                      step="any"
                      value={r.specs[c.key] ?? ""}
                      onChange={(e) => setSpec(r.id, c.key, e.target.value)}
                    />
                  </td>
                ))}
                <td className="px-1 py-1.5">
                  <Input
                    className={`${cell} w-20 min-w-16`}
                    value={r.unit}
                    onChange={(e) => patchRow(r.id, { unit: e.target.value })}
                    placeholder={(isNewCategory ? newCategoryUnit : selectedCategory?.unit_default) || defaultUnit}
                  />
                </td>
                <td className="px-1 py-1.5">
                  <Input
                    className={`${cell} w-28`}
                    type="number"
                    min={0}
                    value={r.sellingPrice}
                    onChange={(e) => patchRow(r.id, { sellingPrice: e.target.value })}
                  />
                </td>
                <td className="px-1 py-1.5">
                  <Input
                    className={`${cell} w-28`}
                    type="number"
                    min={0}
                    value={r.costPrice}
                    onChange={(e) => patchRow(r.id, { costPrice: e.target.value })}
                  />
                </td>
                {!isService ? (
                  <td className="px-1 py-1.5">
                    <Input
                      className={`${cell} w-20`}
                      type="number"
                      min={0}
                      value={r.stock}
                      onChange={(e) => patchRow(r.id, { stock: e.target.value })}
                    />
                  </td>
                ) : null}
                <td className="px-1 py-1.5">
                  <div className="flex gap-0.5">
                    <button
                      type="button"
                      className="flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-canvas hover:text-ink"
                      onClick={() => duplicateRow(r)}
                      title="Duplicate row (keeps family, unit and price)"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-canvas hover:text-red-600 disabled:opacity-30"
                      onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                      disabled={rows.length === 1}
                      title="Remove row"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={addRow}>
          <Plus className="size-3.5" /> Add row
        </Button>
        <p className="text-xs text-ink-muted">
          {filledRows.length} item{filledRows.length === 1 ? "" : "s"} ready · empty rows are skipped
        </p>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={submit}>
          Save {filledRows.length || ""} item{filledRows.length === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}