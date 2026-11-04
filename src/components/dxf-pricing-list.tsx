import { Download, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DEFAULT_DXF_RULES, materialKey } from "@/lib/dxf-calc";
import { downloadDxfRules, readDxfRulesFile } from "@/lib/dxf-rules-xlsx";
import type { DxfCutRule, DxfRuleDraft } from "@/lib/types";

/** Text/number cell that edits locally and saves on blur or Enter (keeps typing like "0.0" intact). */
function Cell({
  value,
  onCommit,
  type = "text",
  className = "",
  placeholder,
  invalid,
  title,
  list,
}: {
  value: string | number | null;
  onCommit: (raw: string) => void;
  type?: "text" | "number";
  className?: string;
  placeholder?: string;
  invalid?: boolean;
  title?: string;
  list?: string;
}) {
  const shown = value == null ? "" : String(value);
  const [v, setV] = useState(shown);
  useEffect(() => setV(shown), [shown]);
  const commit = () => {
    if (v !== shown) onCommit(v);
  };
  return (
    <Input
      className={`h-8 ${invalid ? "ring-2 ring-red-400" : ""} ${className}`}
      type={type}
      min={type === "number" ? 0 : undefined}
      step={type === "number" ? "any" : undefined}
      value={v}
      placeholder={placeholder}
      title={title}
      list={list}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

const numOrNull = (raw: string) => {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function DxfPricingList({
  rules,
  activeRuleId,
  onAdd,
  onUpdate,
  onDelete,
  onReplace,
}: {
  rules: DxfCutRule[];
  /** Row currently priced for the open job, highlighted in the table. */
  activeRuleId?: string;
  onAdd: (draft?: Partial<DxfRuleDraft>) => void;
  onUpdate: (id: string, patch: Partial<DxfRuleDraft>) => void;
  onDelete: (id: string) => void;
  onReplace: (drafts: DxfRuleDraft[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState("all");

  const families = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rules) {
      const k = materialKey(r.material);
      if (k && !seen.has(k)) seen.set(k, r.material);
    }
    return Array.from(seen, ([key, label]) => ({ key, label }));
  }, [rules]);

  const sorted = useMemo(() => {
    const order = new Map(families.map((f, i) => [f.key, i]));
    return rules
      .filter((r) => filter === "all" || materialKey(r.material) === filter)
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const oa = order.get(materialKey(a.r.material)) ?? 999;
        const ob = order.get(materialKey(b.r.material)) ?? 999;
        if (oa !== ob) return oa - ob;
        // Unfinished rows (thickness 0) stay at the bottom of their group, in the order added.
        const ta = a.r.thickness > 0 ? a.r.thickness : Infinity;
        const tb = b.r.thickness > 0 ? b.r.thickness : Infinity;
        return ta !== tb ? ta - tb : a.i - b.i;
      })
      .map((x) => x.r);
  }, [rules, families, filter]);

  const dupKeys = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of rules) {
      const k = `${materialKey(r.material)}|${r.thickness}`;
      count.set(k, (count.get(k) || 0) + 1);
    }
    return new Set([...count].filter(([, n]) => n > 1).map(([k]) => k));
  }, [rules]);

  const missingCount = rules.filter((r) => r.cut_rate == null).length;

  async function handleImport(file: File) {
    try {
      const res = await readDxfRulesFile(file);
      const ok = window.confirm(
        `Replace the current ${rules.length} pricing rows with ${res.rules.length} rows from "${file.name}" (sheet ${res.sheet})?\n\nTip: use Export first if you want a backup.`,
      );
      if (!ok) return;
      onReplace(res.rules);
      setFilter("all");
      const extra = [
        res.skipped ? `${res.skipped} non-price row(s) skipped` : "",
        res.missingCutRate ? `${res.missingCutRate} row(s) have no cut rate` : "",
      ].filter(Boolean);
      toast.success(`Imported ${res.rules.length} pricing rows${extra.length ? ` · ${extra.join(" · ")}` : ""}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that file.");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="h-8 w-44 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All materials ({rules.length})</option>
          {families.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label} ({rules.filter((r) => materialKey(r.material) === f.key).length})
            </option>
          ))}
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onAdd({ material: filter === "all" ? "" : (families.find((f) => f.key === filter)?.label ?? "") })}
        >
          <Plus className="mr-1 size-3.5" /> Add row
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="mr-1 size-3.5" /> Import Excel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!rules.length}
          onClick={() => void downloadDxfRules(rules)}
        >
          <Download className="mr-1 size-3.5" /> Export Excel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            if (window.confirm("Reset the pricing list to the original rows from pricingup.xlsx? Your edits will be lost."))
              onReplace(DEFAULT_DXF_RULES);
          }}
        >
          <RotateCcw className="mr-1 size-3.5" /> Reset to default
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void handleImport(f);
          }}
        />
      </div>

      {missingCount > 0 && (
        <p className="text-xs text-amber-700">
          {missingCount} row{missingCount > 1 ? "s have" : " has"} no cut rate (highlighted). Jobs that land on those rows can&apos;t be
          added until a rate is entered.
        </p>
      )}
      {dupKeys.size > 0 && (
        <p className="text-xs text-amber-700">
          Some material + thickness combinations appear twice. Only the first one is used when pricing.
        </p>
      )}

      <datalist id="dxf-materials">
        {families.map((f) => (
          <option key={f.key} value={f.label} />
        ))}
      </datalist>

      {rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink/15 p-4 text-center text-sm text-ink-muted">
          No pricing rows yet.{" "}
          <button type="button" className="font-medium text-forest underline" onClick={() => onReplace(DEFAULT_DXF_RULES)}>
            Load the default list
          </button>{" "}
          or add rows / import an Excel file.
        </div>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-canvas">
              <tr className="text-left text-xs text-ink-muted">
                <th className="p-1.5">Material</th>
                <th className="p-1.5">Thickness (mm)</th>
                <th className="p-1.5">Pierce (KSh)</th>
                <th className="p-1.5">Cut rate (KSh/mm)</th>
                <th className="p-1.5">≈ KSh/m</th>
                <th className="p-1.5">Speed (mm/min)</th>
                <th className="p-1.5">Gas / notes</th>
                <th className="w-10 p-1.5" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const active = r.rule_id === activeRuleId;
                const dup = dupKeys.has(`${materialKey(r.material)}|${r.thickness}`);
                return (
                  <tr key={r.rule_id} className={`border-t border-ink/5 ${active ? "bg-forest/10" : ""}`}>
                    <td className="p-1">
                      <Cell
                        className="w-32"
                        list="dxf-materials"
                        value={r.material}
                        invalid={!r.material.trim()}
                        placeholder="e.g. titanium"
                        onCommit={(v) => onUpdate(r.rule_id, { material: v.trim() })}
                      />
                    </td>
                    <td className="p-1">
                      <Cell
                        className="w-24"
                        type="number"
                        value={r.thickness || ""}
                        invalid={!(r.thickness > 0) || dup}
                        title={dup ? "Duplicate material + thickness" : undefined}
                        onCommit={(v) => onUpdate(r.rule_id, { thickness: numOrNull(v) ?? 0 })}
                      />
                    </td>
                    <td className="p-1">
                      <Cell
                        className="w-24"
                        type="number"
                        value={r.pierce_cost}
                        onCommit={(v) => onUpdate(r.rule_id, { pierce_cost: numOrNull(v) ?? 0 })}
                      />
                    </td>
                    <td className="p-1">
                      <Cell
                        className="w-28"
                        type="number"
                        value={r.cut_rate}
                        invalid={r.cut_rate == null}
                        title={r.cut_rate == null ? "Cut rate missing" : undefined}
                        onCommit={(v) => onUpdate(r.rule_id, { cut_rate: numOrNull(v) })}
                      />
                    </td>
                    <td className="p-1 text-xs text-ink-muted">
                      {r.cut_rate == null ? "—" : (r.cut_rate * 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    </td>
                    <td className="p-1">
                      <Cell
                        className="w-28"
                        type="number"
                        value={r.cut_speed}
                        onCommit={(v) => onUpdate(r.rule_id, { cut_speed: numOrNull(v) })}
                      />
                    </td>
                    <td className="p-1">
                      <Cell
                        className="w-36"
                        value={r.description}
                        placeholder="oxygen, nitrogen…"
                        onCommit={(v) => onUpdate(r.rule_id, { description: v.trim() })}
                      />
                    </td>
                    <td className="p-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label="Delete row"
                        onClick={() => onDelete(r.rule_id)}
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
      )}
    </div>
  );
}
