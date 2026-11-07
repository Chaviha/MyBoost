import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  addSiblingSubProduct,
  addSubProduct,
  labelFromNodes,
  newSubProduct,
  nodesFromLabel,
  removeSubProduct,
  rowValues,
  stripSubColumn,
  updateSubProduct,
  type SubColumnDef,
  type SubProduct,
} from "@/lib/sub-products";

type CatalogueOption = { product_id?: string; name: string; selling_price?: number };

function flatten(nodes: SubProduct[], depth = 0): Array<{ node: SubProduct; depth: number }> {
  return nodes.flatMap((n) => [{ node: n, depth }, ...flatten(n.children || [], depth + 1)]);
}

function slugKey(label: string, existing: string[]): string {
  const base =
    label
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "COL";
  let key = base;
  let n = 2;
  while (existing.includes(key)) key = `${base}_${n++}`;
  return key;
}

const TYPE_LABEL: Record<SubColumnDef["type"], string> = {
  text: "Text",
  number: "Number",
  formula: "Formula",
  catalogue: "Catalogue",
};

/**
 * Builder: the lookup grid, like an Excel table. One row per product (indent = which dropdown layer it
 * lives in). The grid has its own columns — add or delete them, and make each text, number, formula or
 * catalogue. Picking a product in the sheet copies its row across (to the sheet column of the same name,
 * or the one chosen under "→ fills").
 */
export function SubProductEditor({
  value,
  subColumns,
  onChange,
  catalogue,
  sheetColumnKeys = [],
}: {
  value: SubProduct[];
  subColumns: SubColumnDef[];
  onChange: (patch: { subProducts?: SubProduct[]; subColumns?: SubColumnDef[] }) => void;
  catalogue: CatalogueOption[];
  /** Sheet columns a grid column can fill. */
  sheetColumnKeys?: string[];
}) {
  const linkable = catalogue.filter((p) => p.product_id);
  const rows = flatten(value);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<SubColumnDef["type"]>("number");
  const [newFormula, setNewFormula] = useState("");

  const setTree = (next: SubProduct[]) => onChange({ subProducts: next });
  const setCols = (next: SubColumnDef[]) => onChange({ subColumns: next });
  const patchCol = (key: string, patch: Partial<SubColumnDef>) =>
    setCols(subColumns.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  function addCol() {
    const label = newLabel.trim();
    if (!label) return;
    const key = slugKey(label, subColumns.map((c) => c.key));
    setCols([
      ...subColumns,
      {
        key,
        label,
        type: newType,
        formula: newType === "formula" ? newFormula.trim() || "=0" : undefined,
      },
    ]);
    setNewLabel("");
    setNewFormula("");
  }

  function deleteCol(key: string) {
    onChange({ subColumns: subColumns.filter((c) => c.key !== key), subProducts: stripSubColumn(value, key) });
  }

  function changeType(c: SubColumnDef, type: SubColumnDef["type"]) {
    patchCol(c.key, { type, formula: type === "formula" ? c.formula || "=0" : undefined });
  }

  function focusNext(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const el = e.currentTarget;
    const col = el.dataset.spCol;
    const row = Number(el.dataset.spRow);
    el.closest("table")
      ?.querySelector<HTMLInputElement>(`[data-sp-col="${col}"][data-sp-row="${row + 1}"]`)
      ?.focus();
  }

  function setCell(node: SubProduct, key: string, raw: string) {
    const next = { ...(node.values || {}) };
    if (raw === "") delete next[key];
    else next[key] = raw;
    setTree(updateSubProduct(value, node.id, { values: Object.keys(next).length ? next : undefined }));
  }

  function setLink(node: SubProduct, key: string, productId: string) {
    const links = { ...(node.links || {}) };
    const values = { ...(node.values || {}) };
    if (productId) {
      links[key] = productId;
      const price = linkable.find((p) => p.product_id === productId)?.selling_price;
      if (typeof price === "number") values[key] = price; // cached; live price wins when found
    } else {
      delete links[key];
      delete values[key];
    }
    setTree(
      updateSubProduct(value, node.id, {
        links: Object.keys(links).length ? links : undefined,
        values: Object.keys(values).length ? values : undefined,
      }),
    );
  }

  return (
    <div className="flex min-w-[460px] flex-col gap-1.5 rounded-md border border-forest/20 bg-leaf/10 p-2">
      <label className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
        Products inside this product — lookup grid
      </label>
      {rows.length || subColumns.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left align-top text-[10px] uppercase tracking-wide text-ink-muted">
                <th className="p-1">Product</th>
                <th className="p-1">Rate</th>
                <th className="p-1">Unit</th>
                {subColumns.map((c) => (
                  <th key={c.key} className="min-w-28 p-1 align-top normal-case">
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-6 w-24 text-[11px] font-medium"
                        value={c.label}
                        title={`Column key: ${c.key}`}
                        onChange={(e) => patchCol(c.key, { label: e.target.value })}
                      />
                      <button
                        type="button"
                        className="text-ink-muted hover:text-clay"
                        title={`Delete column ${c.label}`}
                        onClick={() => deleteCol(c.key)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <Select
                      className="mt-0.5 h-6 text-[11px]"
                      value={c.type}
                      onChange={(e) => changeType(c, e.target.value as SubColumnDef["type"])}
                    >
                      {(Object.keys(TYPE_LABEL) as SubColumnDef["type"][]).map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABEL[t]}
                        </option>
                      ))}
                    </Select>
                    {c.type === "formula" ? (
                      <Input
                        className="mt-0.5 h-6 font-mono text-[11px]"
                        value={c.formula || ""}
                        placeholder="=THICKNESS*DENSITY"
                        onChange={(e) => patchCol(c.key, { formula: e.target.value })}
                      />
                    ) : null}
                    <Select
                      className="mt-0.5 h-6 text-[11px]"
                      value={c.target === undefined ? "__auto" : c.target === "" ? "__none" : c.target}
                      title="Sheet column this fills when the product is picked"
                      onChange={(e) =>
                        patchCol(c.key, {
                          target: e.target.value === "__auto" ? undefined : e.target.value === "__none" ? "" : e.target.value,
                        })
                      }
                    >
                      <option value="__auto">→ fills same name</option>
                      <option value="__none">→ not in sheet</option>
                      {sheetColumnKeys.map((k) => (
                        <option key={k} value={k}>
                          → fills {k}
                        </option>
                      ))}
                    </Select>
                  </th>
                ))}
                <th className="p-1">Rate source</th>
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node: n, depth }, i) => {
                const computed = rowValues(n, subColumns, linkable);
                return (
                  <tr key={n.id} className="border-t border-ink/10">
                    <td className="p-0.5" style={{ paddingLeft: 4 + depth * 14 }}>
                      <Input
                        className="h-7 min-w-28 text-xs"
                        value={n.name}
                        data-sp-col="name"
                        data-sp-row={i}
                        placeholder={depth === 0 ? "e.g. Plates" : "e.g. MS"}
                        onKeyDown={focusNext}
                        onChange={(e) => setTree(updateSubProduct(value, n.id, { name: e.target.value }))}
                      />
                    </td>
                    <td className="p-0.5">
                      <Input
                        className="h-7 w-20 text-xs"
                        type="number"
                        min={0}
                        value={n.rate ?? ""}
                        data-sp-col="rate"
                        data-sp-row={i}
                        disabled={!!n.productId}
                        title={n.productId ? "Rate comes from the linked catalogue product" : "Rate"}
                        onKeyDown={focusNext}
                        onChange={(e) =>
                          setTree(
                            updateSubProduct(value, n.id, {
                              rate: e.target.value === "" ? undefined : Number(e.target.value),
                            }),
                          )
                        }
                      />
                    </td>
                    <td className="p-0.5">
                      <Input
                        className="h-7 w-16 text-xs"
                        value={n.unit ?? ""}
                        data-sp-col="unit"
                        data-sp-row={i}
                        onKeyDown={focusNext}
                        onChange={(e) => setTree(updateSubProduct(value, n.id, { unit: e.target.value || undefined }))}
                      />
                    </td>
                    {subColumns.map((c) => (
                      <td key={c.key} className="p-0.5">
                        {c.type === "formula" ? (
                          <div className="flex h-7 min-w-20 items-center justify-end rounded-md bg-paper px-2 tabular-nums text-ink-muted">
                            {computed[c.key] === undefined ? "—" : String(computed[c.key])}
                          </div>
                        ) : c.type === "catalogue" ? (
                          <div className="flex flex-col gap-0.5">
                            <Select
                              className="h-7 w-36 text-xs"
                              value={n.links?.[c.key] ?? ""}
                              onChange={(e) => setLink(n, c.key, e.target.value)}
                            >
                              <option value="">Select…</option>
                              {linkable.map((p) => (
                                <option key={p.product_id} value={p.product_id}>
                                  {p.name}
                                </option>
                              ))}
                            </Select>
                            {computed[c.key] !== undefined ? (
                              <span className="px-1 text-right text-[10px] tabular-nums text-ink-muted">
                                {String(computed[c.key])} synced
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <Input
                            className="h-7 w-24 text-xs"
                            inputMode={c.type === "number" ? "decimal" : undefined}
                            value={n.values?.[c.key] === undefined ? "" : String(n.values[c.key])}
                            data-sp-col={c.key}
                            data-sp-row={i}
                            onKeyDown={focusNext}
                            onChange={(e) => setCell(n, c.key, e.target.value)}
                          />
                        )}
                      </td>
                    ))}
                    <td className="p-0.5">
                      <Select
                        className="h-7 w-32 text-xs"
                        value={n.productId ?? ""}
                        title="Link a catalogue product so the rate stays in sync"
                        onChange={(e) => setTree(updateSubProduct(value, n.id, { productId: e.target.value || undefined }))}
                      >
                        <option value="">None</option>
                        {linkable.map((p) => (
                          <option key={p.product_id} value={p.product_id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="whitespace-nowrap p-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-1.5 text-[11px]"
                        title="Add a product inside this one (next dropdown layer)"
                        onClick={() => setTree(addSubProduct(value, n.id, newSubProduct()))}
                      >
                        <Plus className="mr-0.5 size-3" />
                        Inside
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-1.5 text-[11px]"
                        title="Add a product on the same layer, below this one"
                        onClick={() => setTree(addSiblingSubProduct(value, n.id, newSubProduct()))}
                      >
                        <Plus className="mr-0.5 size-3" />
                        Below
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-1.5"
                        title="Remove (and everything inside it)"
                        onClick={() => setTree(removeSubProduct(value, n.id))}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[10px] text-ink-muted">No products or columns yet</p>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 px-2"
          onClick={() => setTree(addSubProduct(value, null, newSubProduct()))}
        >
          <Plus className="mr-1 size-3" />
          Add product
        </Button>
        <span className="mx-1 h-5 w-px bg-ink/15" />
        <Input
          className="h-8 w-28 text-xs"
          value={newLabel}
          placeholder="New column"
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCol();
            }
          }}
        />
        <Select
          className="h-8 w-28 text-xs"
          value={newType}
          onChange={(e) => setNewType(e.target.value as SubColumnDef["type"])}
        >
          {(Object.keys(TYPE_LABEL) as SubColumnDef["type"][]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        {newType === "formula" ? (
          <Input
            className="h-8 w-40 font-mono text-xs"
            value={newFormula}
            placeholder="=THICKNESS*DENSITY"
            onChange={(e) => setNewFormula(e.target.value)}
          />
        ) : null}
        <Button type="button" size="sm" variant="secondary" className="h-8 px-2" onClick={addCol}>
          <Plus className="mr-1 size-3" />
          Add column
        </Button>
      </div>
      <p className="text-[10px] text-ink-muted">
        Indented rows are the next dropdown layer (Plates → MS). Add columns of your own — text, number,
        formula (use other column names, e.g. =THICKNESS*DENSITY) or catalogue (synced price). Picking a
        product in the sheet copies its row across, and changing the dropdown swaps in the new row’s
        values. Press Enter to move down a column.
      </p>
    </div>
  );
}

/** Quoter: cascading dropdowns, one per layer. Value is the readable path, e.g. "Pipe › CHS › 50NB". */
export function SubProductPicker({
  tree,
  value,
  onChange,
  disabled,
}: {
  tree: SubProduct[] | undefined;
  value: string;
  onChange: (label: string) => void;
  disabled?: boolean;
}) {
  const picked = nodesFromLabel(tree, value);
  const layers: Array<{ options: SubProduct[]; selected?: SubProduct }> = [];
  let level = tree || [];
  for (let i = 0; level.length; i++) {
    const selected = picked[i];
    layers.push({ options: level, selected });
    if (!selected) break;
    level = selected.children || [];
  }
  if (!layers.length) return <p className="text-xs text-ink-muted">No sub-products defined</p>;

  return (
    <div className="flex flex-col gap-1">
      {layers.map((layer, i) => (
        <Select
          key={i}
          className="h-8 min-w-32 text-xs"
          value={layer.selected?.id ?? ""}
          disabled={disabled}
          onChange={(e) => {
            const chosen = layer.options.find((o) => o.id === e.target.value);
            const head = picked.slice(0, i);
            onChange(chosen ? labelFromNodes([...head, chosen]) : labelFromNodes(head));
          }}
        >
          <option value="">{i === 0 ? "Select…" : `Select ${picked[i - 1]?.name ?? "option"}…`}</option>
          {layer.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name || "(unnamed)"}
            </option>
          ))}
        </Select>
      ))}
    </div>
  );
}

