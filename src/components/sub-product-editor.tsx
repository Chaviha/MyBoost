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
  updateSubProduct,
  type SubProduct,
} from "@/lib/sub-products";

type CatalogueOption = { product_id?: string; name: string; selling_price?: number };

/** Builder: define the products nested inside this product, with as many layers as needed. */
function flatten(nodes: SubProduct[], depth = 0): Array<{ node: SubProduct; depth: number }> {
  return nodes.flatMap((n) => [{ node: n, depth }, ...flatten(n.children || [], depth + 1)]);
}

/**
 * Builder: a lookup grid like an Excel table. One row per product (indent = which dropdown layer it
 * lives in), one column per sheet column. Type the values each product should fill; picking that
 * product in the sheet copies the whole row across.
 */
export function SubProductEditor({
  value,
  onChange,
  catalogue,
  columnKeys = [],
}: {
  value: SubProduct[];
  onChange: (next: SubProduct[]) => void;
  catalogue: CatalogueOption[];
  /** Sheet columns a product can fill with its own values (e.g. THICKNESS, DENSITY). */
  columnKeys?: string[];
}) {
  const linkable = catalogue.filter((p) => p.product_id);
  const rows = flatten(value);
  // RATE and UNIT have their own columns, so they are not repeated as value columns
  const valueCols = columnKeys.filter((k) => !["RATE", "UNIT"].includes(k.toUpperCase()));

  function focusNext(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const el = e.currentTarget;
    const grid = el.closest("table");
    const col = el.dataset.spCol;
    const row = Number(el.dataset.spRow);
    const next = grid?.querySelector<HTMLInputElement>(`[data-sp-col="${col}"][data-sp-row="${row + 1}"]`);
    next?.focus();
  }

  function setValue(id: string, node: SubProduct, key: string, raw: string) {
    const next = { ...(node.values || {}) };
    if (raw === "") delete next[key];
    else next[key] = raw;
    onChange(updateSubProduct(value, id, { values: Object.keys(next).length ? next : undefined }));
  }

  return (
    <div className="flex min-w-[420px] flex-col gap-1.5 rounded-md border border-forest/20 bg-leaf/10 p-2">
      <label className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
        Products inside this product — lookup grid
      </label>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-ink-muted">
                <th className="p-1">Product</th>
                <th className="p-1">Rate</th>
                <th className="p-1">Unit</th>
                {valueCols.map((k) => (
                  <th key={k} className="p-1">
                    {k}
                  </th>
                ))}
                <th className="p-1">Catalogue</th>
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node: n, depth }, i) => (
                <tr key={n.id} className="border-t border-ink/10">
                  <td className="p-0.5" style={{ paddingLeft: 4 + depth * 14 }}>
                    <Input
                      className="h-7 min-w-28 text-xs"
                      value={n.name}
                      data-sp-col="name"
                      data-sp-row={i}
                      placeholder={depth === 0 ? "e.g. Plates" : "e.g. MS"}
                      onKeyDown={focusNext}
                      onChange={(e) => onChange(updateSubProduct(value, n.id, { name: e.target.value }))}
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
                        onChange(
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
                      onChange={(e) => onChange(updateSubProduct(value, n.id, { unit: e.target.value || undefined }))}
                    />
                  </td>
                  {valueCols.map((k) => (
                    <td key={k} className="p-0.5">
                      <Input
                        className="h-7 w-20 text-xs"
                        value={n.values?.[k] === undefined ? "" : String(n.values[k])}
                        data-sp-col={k}
                        data-sp-row={i}
                        onKeyDown={focusNext}
                        onChange={(e) => setValue(n.id, n, k, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="p-0.5">
                    <Select
                      className="h-7 w-32 text-xs"
                      value={n.productId ?? ""}
                      title="Link a catalogue product so the rate stays in sync"
                      onChange={(e) =>
                        onChange(updateSubProduct(value, n.id, { productId: e.target.value || undefined }))
                      }
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
                      onClick={() => onChange(addSubProduct(value, n.id, newSubProduct()))}
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
                      onClick={() => onChange(addSiblingSubProduct(value, n.id, newSubProduct()))}
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
                      onClick={() => onChange(removeSubProduct(value, n.id))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[10px] text-ink-muted">No products yet</p>
      )}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-8 w-fit px-2"
        onClick={() => onChange(addSubProduct(value, null, newSubProduct()))}
      >
        <Plus className="mr-1 size-3" />
        Add product
      </Button>
      <p className="text-[10px] text-ink-muted">
        Indented rows are the next dropdown layer (Plates → MS). Fill a row’s cells and picking it in the
        sheet copies those values across; changing the dropdown swaps them for the new row’s. Press Enter
        to move down a column.
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

