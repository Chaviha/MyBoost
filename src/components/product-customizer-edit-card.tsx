import { useEffect, useMemo, useState } from "react";
import { Package, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { money } from "@/lib/format";
import type { Product, ProductCustomizerConfig, SpecValues } from "@/lib/types";

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

function evaluateFormulas(
  cells: Record<string, string | number | null>,
  config: ProductCustomizerConfig,
): { cells: Record<string, string | number | null>; total: number; error?: string } {
  const next = { ...cells };
  const columns = config.columns || [];
  const formulas = { ...(config.formulas || {}) };
  try {
    for (const col of columns) {
      if (col.type !== "formula") continue;
      let expr = (formulas[col.key] ?? col.formula ?? "0").trim().replace(/^=/, "");
      const keys = columns.map((c) => c.key).sort((a, b) => b.length - a.length);
      for (const key of keys) {
        const val = next[key];
        const num = typeof val === "number" ? val : Number(val ?? 0);
        expr = expr.replace(new RegExp(`\\b${key}\\b`, "gi"), String(Number.isFinite(num) ? num : 0));
      }
      next[col.key] = evaluateArithmetic(expr);
    }
    const amountCol =
      columns.find((c) => c.key === "AMOUNT" && c.type === "formula") ||
      columns.filter((c) => c.type === "formula").at(-1);
    const total = amountCol ? Number(next[amountCol.key] ?? 0) : Number(config.total ?? 0);
    return { cells: next, total };
  } catch (e) {
    return {
      cells: next,
      total: Number(config.total ?? 0),
      error: e instanceof Error ? e.message : "Invalid formula",
    };
  }
}

type Props = {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: {
    specs?: SpecValues;
    cost_price?: number;
    selling_price?: number;
    customizer?: ProductCustomizerConfig;
  }) => void;
};

/** Dialog card: view/edit unlocked customizer fields for a catalogue product. */
export function ProductCustomizerEditDialog({ product, open, onOpenChange, onSave }: Props) {
  const config = product.customizer;
  const [cells, setCells] = useState<Record<string, string | number | null>>(
    () => ({ ...(config?.cells || {}) }),
  );

  // Reset local state when opening a different product
  useEffect(() => {
    if (open) {
      setCells({ ...(config?.cells || {}) });
    }
  }, [open, product.product_id, config]);

  const unlocked = config?.unlocked || [];
  const computed = useMemo(() => {
    if (!config) return { cells, total: product.selling_price, error: undefined as string | undefined };
    return evaluateFormulas(cells, config);
  }, [cells, config, product.selling_price]);

  if (!config) return null;

  function updateField(key: string, value: string | number | null) {
    setCells((c) => ({ ...c, [key]: value }));
  }

  function handleSave() {
    if (!config) return;
    if (computed.error) {
      toast.error(computed.error);
      return;
    }
    const specs: SpecValues = { ...(product.specs || {}) };
    for (const u of unlocked) {
      const v = computed.cells[u.key];
      if (v !== null && v !== undefined && v !== "") {
        specs[u.key.toLowerCase()] = v as string | number;
      }
    }
    const nextConfig: ProductCustomizerConfig = {
      ...config,
      cells: computed.cells,
      total: computed.total,
    };
    onSave({
      specs,
      cost_price: computed.total,
      selling_price: computed.total,
      customizer: nextConfig,
    });
    toast.success("Product updated from editable fields.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(calc(100%-2rem),28rem)] max-h-[min(90dvh,36rem)]">
        <DialogHeader>
          <DialogTitle>Edit custom fields</DialogTitle>
          <DialogDescription>
            Unlocked fields for <span className="font-medium text-ink">{product.name}</span>. Locked
            sizes stay fixed.
          </DialogDescription>
        </DialogHeader>

        <Card className="space-y-3 border-forest/20 bg-leaf/20 p-4 shadow-none">
          <div className="flex items-start gap-2">
            <Package className="mt-0.5 size-4 shrink-0 text-forest" />
            <div>
              <p className="text-sm font-semibold">Editable fields</p>
              <p className="text-xs text-ink-muted">
                Change these values to refresh product costing and specifications.
              </p>
            </div>
          </div>

          {unlocked.length === 0 ? (
            <p className="text-xs text-ink-muted">No unlocked fields on this product.</p>
          ) : (
            <div className="grid gap-2">
              {unlocked.map((u) => {
                const isNumeric = u.type === "number" || u.type === "size";
                const value = cells[u.key];
                return (
                  <div key={u.key} className="rounded-md border border-ink/10 bg-paper px-3 py-2">
                    <label className="mb-1 block text-xs text-ink-muted">
                      {u.label}
                      {u.unit ? ` (${u.unit})` : ""}
                    </label>
                    <Input
                      className="h-9"
                      type={isNumeric ? "number" : "text"}
                      min={isNumeric ? 0 : undefined}
                      step={u.type === "size" ? "any" : undefined}
                      value={value === null || value === undefined ? "" : String(value)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (isNumeric) {
                          updateField(u.key, raw === "" ? 0 : Number(raw));
                        } else {
                          updateField(u.key, raw);
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-ink/10 pt-2 text-sm">
            <span className="text-ink-muted">Updated costing</span>
            <span className="font-semibold tabular-nums">{money(computed.total)}</span>
          </div>
          {computed.error ? <p className="text-xs text-red-600">{computed.error}</p> : null}
        </Card>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!!computed.error}>
            <Save className="mr-1 size-4" />
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Inline badge/button to open the customizer edit card when a product has one. */
export function ProductCustomizerEditTrigger({
  product,
  onClick,
}: {
  product: Product;
  onClick: () => void;
}) {
  if (!product.customizer?.unlocked?.length) return null;
  return (
    <Button type="button" size="sm" variant="secondary" onClick={onClick}>
      <Package className="mr-1 size-3.5" />
      Edit custom fields
    </Button>
  );
}
