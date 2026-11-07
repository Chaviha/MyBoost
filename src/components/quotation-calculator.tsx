import { useMemo, useState } from "react";
import { Plus, Calculator, Trash2, ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { money, uid } from "@/lib/format";
import { evaluateFormula as evaluateArithmetic } from "@/lib/formula-eval";
import type { QuoteLineItem } from "@/lib/types";

type SheetRow = {
  id: string;
  description: string;
  qty: string;
  unit: string;
  rate: string;
  formula: string;
};

/* evaluateArithmetic imported from @/lib/formula-eval */

function rowAmount(row: SheetRow): number {
  const qty = Number(row.qty || 0);
  const rate = Number(row.rate || 0);
  const expression = row.formula.trim().replace(/^=/, "")
    .replace(/\bQTY\b/gi, String(qty))
    .replace(/\bRATE\b/gi, String(rate));
  return evaluateArithmetic(expression);
}

function newRow(index: number): SheetRow {
  return {
    id: uid("CALC"),
    description: `Item ${index + 1}`,
    qty: "1",
    unit: "item",
    rate: "0",
    formula: "=QTY*RATE",
  };
}

export function CustomQuotationCalculator({
  onAdd,
}: {
  onAdd: (item: QuoteLineItem) => void;
}) {
  const [rows, setRows] = useState<SheetRow[]>([newRow(0)]);
  const [added, setAdded] = useState(false);
  const calculated = useMemo(() => rows.map((row) => {
    try {
      return { ...row, amount: rowAmount(row), error: "" };
    } catch (error) {
      return {
        ...row,
        amount: 0,
        error: error instanceof Error ? error.message : "Invalid formula",
      };
    }
  }), [rows]);
  const total = calculated.reduce((sum, row) => sum + (row.error ? 0 : row.amount), 0);

  function updateRow(id: string, patch: Partial<SheetRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
    setAdded(false);
  }

  function transferToQuote() {
    const invalid = calculated.find((row) => row.error);
    if (invalid) return toast.error(`${invalid.description}: ${invalid.error}`);
    const validRows = calculated.filter((row) => row.description.trim() && row.amount !== 0);
    if (!validRows.length) return toast.error("Add at least one priced item.");
    validRows.forEach((row) => onAdd({
      line_id: uid("LI"),
      description: row.description.trim(),
      qty: Number(row.qty || 0),
      unit: row.unit || "item",
      rate: Number(row.rate || 0),
      amount: row.amount,
      customized: true,
      meta: { calculator: "custom-spreadsheet", formula: row.formula },
    }));
    setAdded(true);
    toast.success(`${validRows.length} calculated item(s) added to quotation.`);
  }

  return (
    <Card className="mb-4 space-y-4 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-leaf/50 p-2"><Calculator className="size-5" /></div>
        <div>
          <p className="font-semibold">Excel-style quotation calculator</p>
          <p className="text-xs text-ink-muted">
            Enter quantities and rates, then customise each amount formula. Use QTY and RATE in formulas.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-ink/10">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="bg-canvas text-left">
              {["Description", "Qty", "Unit", "Rate (KSh)", "Amount formula", "Amount (KSh)", ""].map((label) =>
                <th key={label} className="border-b border-ink/10 p-2 font-medium">{label}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {calculated.map((row, index) => (
              <tr key={row.id}>
                <td className="border-b border-ink/10 p-1">
                  <Input className="min-w-36" value={row.description} onChange={(e) => updateRow(row.id, { description: e.target.value })} />
                </td>
                <td className="border-b border-ink/10 p-1">
                  <Input className="w-20" type="number" min="0" value={row.qty} onChange={(e) => updateRow(row.id, { qty: e.target.value })} />
                </td>
                <td className="border-b border-ink/10 p-1">
                  <Input className="w-24" value={row.unit} onChange={(e) => updateRow(row.id, { unit: e.target.value })} />
                </td>
                <td className="border-b border-ink/10 p-1">
                  <Input className="w-28" type="number" min="0" value={row.rate} onChange={(e) => updateRow(row.id, { rate: e.target.value })} />
                </td>
                <td className="border-b border-ink/10 p-1">
                  <Input className="min-w-40 font-mono" value={row.formula} onChange={(e) => updateRow(row.id, { formula: e.target.value })} />
                  {row.error ? <p className="px-1 text-xs text-red-600">{row.error}</p> : null}
                </td>
                <td className="border-b border-ink/10 p-2 text-right font-medium tabular-nums">{money(row.amount)}</td>
                <td className="border-b border-ink/10 p-1">
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${row.description}`} onClick={() => { setRows((current) => current.filter((r) => r.id !== row.id)); setAdded(false); }}>
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-muted">
        Formula examples: <code>=QTY*RATE</code>, <code>=IF(QTY&gt;10,RATE*0.9,RATE)</code>,{" "}
        <code>=SINDEG(30)*QTY</code>. Supports + − × ÷, parentheses, SIN/COS/TAN (degrees), SINRAD/COSRAD/TANRAD (radians),
        ASIN/ACOS/ATAN/ATAN2 (inverse trig, degrees), IF, AND/OR/NOT, ABS/SQRT/MIN/MAX/ROUND, PI(). Each row calculates independently.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => { setRows((current) => [...current, newRow(current.length)]); setAdded(false); }}>
          <Plus className="mr-1 size-4" /> Add row
        </Button>
        <div className="text-right">
          <p className="text-xs text-ink-muted">Spreadsheet total</p>
          <p className="text-lg font-semibold tabular-nums">{money(total)}</p>
        </div>
      </div>

      <Button type="button" className="w-full" onClick={transferToQuote} disabled={!calculated.length || calculated.some((row) => !!row.error)}>
        <ArrowDownToLine className="mr-2 size-4" /> {added ? "Add updated calculations again" : "Transfer calculated items to quotation"}
      </Button>
      {added ? <p className="text-xs text-forest">Items have been added to the quotation below. Avoid transferring them twice unless you intend to duplicate them.</p> : null}
    </Card>
  );
}
