import { createFileRoute } from "@tanstack/react-router";
import { ListChecks, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { Toolbar } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dxfLineTotal, DXF_MATERIALS, matchDxfRate, parseDXF } from "@/lib/dxf-calc";
import { formatDate, money, uid } from "@/lib/format";
import {
  labourLineTotal,
  matchLabourRate,
  matchSteelProduct,
  rolledLength,
  STEEL_CATEGORY_LABELS,
  STEEL_GRADES,
  STEEL_SPECS,
  steelLineTotal,
  steelWeightKg,
  type SteelCategory,
} from "@/lib/steel-calc";
import { useLife } from "@/lib/store";
import type { MarketplaceProduct, QuoteLineItem, QuoteType } from "@/lib/types";

const QUOTE_TYPES: { value: QuoteType; label: string; blurb: string }[] = [
  { value: "general", label: "General", blurb: "A simple one-line estimate" },
  { value: "steel", label: "Steel", blurb: "Plate, RHS, SHS, CHS, shaft — priced by weight" },
  { value: "dxf_cut", label: "DXF Cut", blurb: "Laser/plasma cut cost from a DXF file" },
  {
    value: "custom_product",
    label: "Materials & Products",
    blurb: "Search anything listed across LifeBoost — steel, agriculture, construction & more",
  },
];

export const Route = createFileRoute("/_app/quotations")({
  component: QuotationsPage,
});

function QuotationsPage() {
  const { selectedBusiness, businessQuotes, businessCustomers, addQuotation, can } = useLife();
  const [open, setOpen] = useState(false);

  if (!can("manage_quotes")) {
    return <AccessDenied need="Quotations are for business owners." />;
  }
  if (!selectedBusiness) return <EmptyState icon={ListChecks} text="Add a business first." />;

  return (
    <>
      <Toolbar
        title="Quotations"
        subtitle={`Estimates sent from ${selectedBusiness.business_name}`}
        actionLabel="New quotation"
        onAction={() => setOpen(true)}
      />
      {businessQuotes.length === 0 ? (
        <EmptyState icon={ListChecks} text="No quotations yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {businessQuotes.map((q) => {
            const suppliers = Array.from(
              new Set((q.line_items || []).map((li) => li.source_business_name).filter(Boolean)),
            ) as string[];
            const supplierLabel = suppliers.length
              ? suppliers.length === 1
                ? suppliers[0]
                : `${suppliers.length} suppliers (${suppliers.join(", ")})`
              : q.pricing_business_name;
            return (
            <Card key={q.quote_id} className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <p className="font-medium">{q.customer_name}</p>
                <p className="text-xs text-ink-muted">
                  {q.notes || formatDate(q.date)}
                  {supplierLabel ? ` · priced from ${supplierLabel}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {q.quote_type && q.quote_type !== "general" ? (
                  <Badge tone="neutral">
                    {QUOTE_TYPES.find((t) => t.value === q.quote_type)?.label ?? q.quote_type}
                  </Badge>
                ) : null}
                <p className="font-medium tabular-nums">{money(q.total)}</p>
                <Badge tone={q.status === "Accepted" ? "forest" : "amber"}>{q.status}</Badge>
              </div>
            </Card>
            );
          })}
        </div>
      )}
      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent className="w-[min(calc(100%-2rem),42rem)] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New quotation</DialogTitle>
          </DialogHeader>
          <QuoteWizard
            customers={businessCustomers}
            onCancel={() => setOpen(false)}
            onSubmit={(form) => {
              addQuotation(form);
              toast.success("Quotation sent.");
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

type WizardForm = {
  customerId: string;
  total: string;
  notes: string;
  quoteType: QuoteType;
  pricingBusinessId?: string;
  lineItems?: QuoteLineItem[];
};

function QuoteWizard({
  customers,
  onCancel,
  onSubmit,
}: {
  customers: { customer_id: string; name: string }[];
  onCancel: () => void;
  onSubmit: (form: WizardForm) => void;
}) {
  const { publicMarketplace } = useLife();
  const [quoteType, setQuoteType] = useState<QuoteType | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const [businessFilter, setBusinessFilter] = useState("");
  const [generalTotal, setGeneralTotal] = useState("");
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([]);

  // The catalog every quote suggests from: every product any business on LifeBoost
  // has listed, regardless of sector — steel, agriculture, construction, etc.
  const allListedProducts = publicMarketplace.products;
  const catalogBusinesses = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allListedProducts) map.set(p.business_id, p.business_name);
    return Array.from(map, ([business_id, business_name]) => ({ business_id, business_name }));
  }, [allListedProducts]);
  const catalog = useMemo(
    () => (businessFilter ? allListedProducts.filter((p) => p.business_id === businessFilter) : allListedProducts),
    [allListedProducts, businessFilter],
  );

  const runningTotal = lineItems.reduce((s, li) => s + li.amount, 0);

  function addLineItem(li: QuoteLineItem) {
    setLineItems((prev) => [...prev, li]);
  }
  function removeLineItem(id: string) {
    setLineItems((prev) => prev.filter((li) => li.line_id !== id));
  }

  function handleSubmit() {
    if (!customerId) return toast.error("Select a customer.");
    if (quoteType === "general") {
      if (!generalTotal) return toast.error("Enter a total.");
      onSubmit({ customerId, total: generalTotal, notes, quoteType: "general" });
      return;
    }
    if (!lineItems.length) return toast.error("Add at least one item.");
    onSubmit({
      customerId,
      total: String(runningTotal),
      notes,
      quoteType: quoteType!,
      pricingBusinessId: businessFilter || undefined,
      lineItems,
    });
  }

  // ── Step 1: pick a type ──────────────────────────────────────────────
  if (!quoteType) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {QUOTE_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setQuoteType(t.value)}
            className="rounded-lg border border-ink/10 p-4 text-left hover:border-forest hover:bg-leaf/40"
          >
            <p className="font-medium">{t.label}</p>
            <p className="text-xs text-ink-muted">{t.blurb}</p>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="mb-3 text-xs text-ink-muted hover:text-ink"
        onClick={() => {
          setQuoteType(null);
          setLineItems([]);
        }}
      >
        ← Change quote type
      </button>

      <Field label="Customer">
        <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Select…</option>
          {customers.map((c) => (
            <option key={c.customer_id} value={c.customer_id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      {quoteType === "general" ? (
        <Field label="Total (KSh)">
          <Input
            type="number"
            min={0}
            value={generalTotal}
            onChange={(e) => setGeneralTotal(e.target.value)}
          />
        </Field>
      ) : (
        <>
          {catalogBusinesses.length > 1 && (
            <Field label="Search catalog" hint="optional — narrow suggestions to one business">
              <Select value={businessFilter} onChange={(e) => setBusinessFilter(e.target.value)}>
                <option value="">All listed businesses (recommended)</option>
                {catalogBusinesses.map((b) => (
                  <option key={b.business_id} value={b.business_id}>
                    {b.business_name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {quoteType === "steel" && <SteelBuilder products={catalog} onAdd={addLineItem} />}
          {quoteType === "dxf_cut" && <DxfBuilder products={catalog} onAdd={addLineItem} />}
          {quoteType === "custom_product" && <MaterialsBuilder products={catalog} onAdd={addLineItem} />}

          <LineItemsList items={lineItems} onRemove={removeLineItem} />
          <ExtraChargeBuilder onAdd={addLineItem} />
        </>
      )}

      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          {quoteType !== "general" ? <>Total: <span className="font-medium text-ink">{money(runningTotal)}</span></> : null}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function LineItemsList({ items, onRemove }: { items: QuoteLineItem[]; onRemove: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="mb-3 flex flex-col gap-2">
      {items.map((li) => (
        <div
          key={li.line_id}
          className="flex items-center justify-between gap-2 rounded-md bg-canvas px-3 py-2 text-sm"
        >
          <div>
            <p className="font-medium">{li.description}</p>
            <p className="text-xs text-ink-muted">
              {li.qty} {li.unit} @ {money(li.rate)}
              {li.source_business_name ? ` · ${li.source_business_name}` : ""}
              {li.customized ? " · customized" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="tabular-nums">{money(li.amount)}</span>
            <button type="button" onClick={() => onRemove(li.line_id)} aria-label="Remove item">
              <Trash2 className="size-4 text-ink-muted hover:text-red-600" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Labour / extras — on top of material, not sourced from any catalog ──
function ExtraChargeBuilder({ onAdd }: { onAdd: (li: QuoteLineItem) => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"labour" | "extras">("labour");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  function add() {
    if (!amount) return toast.error("Enter an amount.");
    onAdd({
      line_id: uid("LI"),
      description: description || (kind === "labour" ? "Labour" : "Extras"),
      qty: 1,
      unit: "job",
      rate: Number(amount),
      amount: Number(amount),
      meta: { type: kind },
    });
    setDescription("");
    setAmount("");
    setOpen(false);
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        + Add labour / extras
      </Button>
    );
  }

  return (
    <Card className="mb-3 p-4">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Field label="Type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as "labour" | "extras")}>
            <option value="labour">Labour (rolling, welding, fitting…)</option>
            <option value="extras">Extras (delivery, paint, connectors…)</option>
          </Select>
        </Field>
        <Field label="Amount (KSh)">
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
      <Field label="Description">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={kind === "labour" ? "e.g. Rolling & weld join" : "e.g. Delivery to site"}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={add}>
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

// ── Steel builder ──────────────────────────────────────────────────────
function SteelBuilder({
  products,
  onAdd,
}: {
  products: MarketplaceProduct[];
  onAdd: (li: QuoteLineItem) => void;
}) {
  const [category, setCategory] = useState<SteelCategory | "">("");
  const [grade, setGrade] = useState("");
  const [dims, setDims] = useState<Record<string, string>>({});
  const [qty, setQty] = useState("1");
  const [rolled, setRolled] = useState(false);
  const [diameter, setDiameter] = useState("");
  const [overlap, setOverlap] = useState("50");
  const [includeLabour, setIncludeLabour] = useState(false);

  const specs = category ? STEEL_SPECS[category] : [];
  const hasLengthSpec = specs.some((s) => s.id === "length");
  const visibleSpecs = rolled && hasLengthSpec ? specs.filter((s) => s.id !== "length") : specs;

  const numericDims = Object.fromEntries(
    Object.entries(dims).map(([k, v]) => [k, Number(v || 0)]),
  );
  const derivedLength = rolled && hasLengthSpec ? rolledLength(Number(diameter || 0), Number(overlap || 0)) : null;
  if (derivedLength !== null) numericDims.length = derivedLength;

  const weight = category && grade ? steelWeightKg(category, grade, numericDims) : 0;
  const match = category && grade ? matchSteelProduct(products, category, grade, numericDims) : null;
  const matchedBusiness = match ? products.find((p) => p.product_id === match.product.product_id) : undefined;
  const rate = match?.product.selling_price ?? 0;
  const lineTotal = steelLineTotal(weight, Number(qty || 1), rate);

  // Labour — same as material: driven by weight, thickness & material type, not a flat fee.
  const thicknessForLabour = numericDims.thickness || numericDims.dia || 0;
  const labourMatch =
    includeLabour && category && grade ? matchLabourRate(products, grade, thicknessForLabour) : null;
  const labourBusiness = labourMatch
    ? products.find((p) => p.product_id === labourMatch.product.product_id)
    : undefined;
  const labourRate = labourMatch?.product.selling_price ?? 0;
  const labourTotal = labourLineTotal(weight, Number(qty || 1), labourRate);

  function add() {
    if (!category || !grade) return toast.error("Choose a category and grade.");
    if (rolled && !diameter) return toast.error("Enter the rolled diameter.");
    if (!match) return toast.error("No matching product found in this catalog for that grade/thickness.");
    const dimStr = visibleSpecs.map((s) => `${s.label.split(" ")[0]}: ${dims[s.id] || 0}mm`).join(" × ");
    const rolledNote = rolled ? `Rolled Ø${diameter}mm` : "";
    onAdd({
      line_id: uid("LI"),
      description: `${STEEL_CATEGORY_LABELS[category]} — ${grade} | ${[dimStr, rolledNote].filter(Boolean).join(" · ")}`,
      qty: Number(qty || 1),
      unit: "pc",
      rate,
      // material only — the length used is the rolled circumference, not a full stock bar
      amount: lineTotal,
      source_product_id: match.product.product_id,
      source_business_id: matchedBusiness?.business_id,
      source_business_name: matchedBusiness?.business_name,
      meta: {
        category,
        grade,
        ...numericDims,
        weightKg: Number(weight.toFixed(3)),
        ...(rolled ? { rolledDiameterMm: Number(diameter), overlapMm: Number(overlap || 0) } : {}),
      },
    });
    if (includeLabour && labourMatch && labourTotal > 0) {
      onAdd({
        line_id: uid("LI"),
        description: `Labour — ${labourMatch.product.name}`,
        qty: Number(qty || 1),
        unit: "pc",
        rate: labourRate,
        amount: labourTotal,
        source_product_id: labourMatch.product.product_id,
        source_business_id: labourBusiness?.business_id,
        source_business_name: labourBusiness?.business_name,
        meta: { type: "labour", grade, thicknessMm: thicknessForLabour, weightKg: Number(weight.toFixed(3)) },
      });
    }
    setDims({});
    setQty("1");
    setDiameter("");
  }

  return (
    <Card className="mb-3 p-4">
      <Field label="Category">
        <Select value={category} onChange={(e) => { setCategory(e.target.value as SteelCategory); setGrade(""); setDims({}); }}>
          <option value="">Select…</option>
          {Object.entries(STEEL_CATEGORY_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      {category && (
        <Field label="Grade">
          <Select value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">Select…</option>
            {STEEL_GRADES[category].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {category && hasLengthSpec && (
        <label className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={rolled}
            onChange={(e) => {
              setRolled(e.target.checked);
              setDims((d) => ({ ...d, length: "" }));
            }}
          />
          Rolled into a ring/hoop — charge only the material used, not a full stock length
        </label>
      )}
      {category && visibleSpecs.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {visibleSpecs.map((s) => (
            <Field key={s.id} label={s.label}>
              <Input
                type="number"
                min={0}
                value={dims[s.id] || ""}
                onChange={(e) => setDims((d) => ({ ...d, [s.id]: e.target.value }))}
              />
            </Field>
          ))}
          {rolled && hasLengthSpec && (
            <>
              <Field label="Rolled diameter (mm)">
                <Input type="number" min={0} value={diameter} onChange={(e) => setDiameter(e.target.value)} />
              </Field>
              <Field label="Weld overlap (mm)">
                <Input type="number" min={0} value={overlap} onChange={(e) => setOverlap(e.target.value)} />
              </Field>
            </>
          )}
        </div>
      )}
      {rolled && derivedLength !== null && diameter && (
        <p className="mb-3 text-xs text-ink-muted">
          Ø{diameter}mm ring needs {(derivedLength / 1000).toFixed(2)}m of material (incl. {overlap || 0}mm overlap) — not a full stock length.
        </p>
      )}
      {category && grade && (
        <Field label="Quantity (pcs)">
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
      )}
      {category && grade && weight > 0 && (
        <p className="mb-3 text-xs text-ink-muted">
          {weight.toFixed(3)} kg/pc
          {match ? (
            <>
              {" "}
              · matched <span className="font-medium text-ink">{match.product.name}</span>
              {matchedBusiness ? ` from ${matchedBusiness.business_name}` : ""} @ {money(rate)}/kg
            </>
          ) : (
            <span className="text-red-600"> · no listed product matches this grade/thickness yet — try Materials & Products to add a custom line instead</span>
          )}
        </p>
      )}
      {category && grade && weight > 0 && (
        <label className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={includeLabour} onChange={(e) => setIncludeLabour(e.target.checked)} />
          Add labour — priced by weight, thickness & material type, same as the material
        </label>
      )}
      {includeLabour && category && grade && weight > 0 && (
        <p className="mb-3 text-xs text-ink-muted">
          {labourMatch ? (
            <>
              labour: matched <span className="font-medium text-ink">{labourMatch.product.name}</span>
              {labourBusiness ? ` from ${labourBusiness.business_name}` : ""} @ {money(labourRate)}/kg ={" "}
              {money(labourTotal)}
            </>
          ) : (
            <span className="text-red-600">
              no listed labour rate for {grade} at this thickness — list one as a product (e.g. "Rolling Labour {grade} {thicknessForLabour}mm") or add it via + Add labour / extras below
            </span>
          )}
        </p>
      )}
      <Button type="button" variant="ghost" onClick={add} disabled={!match || weight <= 0}>
        Add item
      </Button>
    </Card>
  );
}

// ── DXF builder ─────────────────────────────────────────────────────────
function DxfBuilder({
  products,
  onAdd,
}: {
  products: MarketplaceProduct[];
  onAdd: (li: QuoteLineItem) => void;
}) {
  const [material, setMaterial] = useState("");
  const [thickness, setThickness] = useState("");
  const [qty, setQty] = useState("1");
  const [fileName, setFileName] = useState("");
  const [cutLenMm, setCutLenMm] = useState(0);
  const [pierces, setPierces] = useState(0);

  async function handleFile(file: File) {
    setFileName(file.name);
    const text = await file.text();
    try {
      const parsed = parseDXF(text);
      setCutLenMm(parsed.totalLen);
      setPierces(parsed.pierces);
    } catch {
      toast.error("Could not parse that DXF file.");
    }
  }

  const rate = material && thickness ? matchDxfRate(products, material, Number(thickness)) : null;
  const costs = rate ? dxfLineTotal(cutLenMm, pierces, rate, Number(qty || 1)) : null;
  const matchedBusiness = rate?.product ? products.find((p) => p.product_id === rate.product?.product_id) : undefined;

  function add() {
    if (!material || !thickness) return toast.error("Choose material and thickness.");
    if (!cutLenMm) return toast.error("Upload a DXF file, or enter a cut length below.");
    if (!rate || !costs) return;
    onAdd({
      line_id: uid("LI"),
      description: `DXF Cut — ${material} ${thickness}mm${fileName ? ` (${fileName})` : ""}`,
      qty: Number(qty || 1),
      unit: "job",
      rate: rate.cutRate,
      amount: costs.total,
      source_product_id: rate.product?.product_id,
      source_business_id: matchedBusiness?.business_id,
      source_business_name: matchedBusiness?.business_name,
      meta: {
        material,
        thickness: Number(thickness),
        cutLenM: Number((cutLenMm / 1000).toFixed(2)),
        pierces,
        rateSource: rate.source,
      },
    });
    setFileName("");
    setCutLenMm(0);
    setPierces(0);
    setQty("1");
  }

  return (
    <Card className="mb-3 p-4">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Field label="Material">
          <Select value={material} onChange={(e) => setMaterial(e.target.value)}>
            <option value="">Select…</option>
            {DXF_MATERIALS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Thickness (mm)">
          <Input type="number" min={0} value={thickness} onChange={(e) => setThickness(e.target.value)} />
        </Field>
      </div>

      <Field label="DXF file" hint="auto-computes cut length & pierces">
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-ink/20 px-3 py-2 text-sm text-ink-muted hover:border-forest">
          <Upload className="size-4" />
          {fileName || "Upload a .dxf file"}
          <input
            type="file"
            accept=".dxf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      </Field>

      {cutLenMm > 0 && (
        <p className="mb-3 text-xs text-ink-muted">
          {(cutLenMm / 1000).toFixed(2)} m cut length · {pierces} pierces
        </p>
      )}

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Field label="Cut length (m)">
          <Input
            type="number"
            min={0}
            value={cutLenMm ? (cutLenMm / 1000).toFixed(2) : ""}
            onChange={(e) => setCutLenMm(Number(e.target.value || 0) * 1000)}
          />
        </Field>
        <Field label="Pierces">
          <Input type="number" min={0} value={pierces || ""} onChange={(e) => setPierces(Number(e.target.value || 0))} />
        </Field>
        <Field label="Quantity">
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
      </div>

      {rate && costs && (
        <p className="mb-3 text-xs text-ink-muted">
          {rate.source === "catalog" ? (
            <>
              using <span className="font-medium text-ink">{rate.product?.name}</span>
              {matchedBusiness ? ` from ${matchedBusiness.business_name}` : ""}
            </>
          ) : (
            <span>no listed product matches yet — using typical {material.toLowerCase()} rates</span>
          )}
          {" · "}pierce {money(costs.pierceCost)} + cut {money(costs.cutCost)}
        </p>
      )}

      <Button type="button" variant="ghost" onClick={add} disabled={!material || !thickness || !cutLenMm}>
        Add item
      </Button>
    </Card>
  );
}

// ── Materials & products: search-and-suggest across every listed business,
// any sector, with a customize option and a fully free-form fallback ──────
function MaterialsBuilder({
  products,
  onAdd,
}: {
  products: MarketplaceProduct[];
  onAdd: (li: QuoteLineItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ description: "", unit: "unit", rate: "", qty: "1" });
  const [addingCustom, setAddingCustom] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return products
      .filter((p) => `${p.category} ${p.name} ${p.business_name}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, query]);

  function startEdit(p: MarketplaceProduct) {
    setEditingId(p.product_id);
    setDraft({ description: p.name, unit: p.unit || "unit", rate: String(p.selling_price), qty: "1" });
  }

  function addSuggestion(p: MarketplaceProduct, qty = 1) {
    onAdd({
      line_id: uid("LI"),
      description: p.name,
      qty,
      unit: p.unit || "unit",
      rate: p.selling_price,
      amount: p.selling_price * qty,
      source_product_id: p.product_id,
      source_business_id: p.business_id,
      source_business_name: p.business_name,
    });
    setQuery("");
  }

  function addEdited(p: MarketplaceProduct) {
    const rate = Number(draft.rate || 0);
    const qty = Number(draft.qty || 1);
    onAdd({
      line_id: uid("LI"),
      description: draft.description || p.name,
      qty,
      unit: draft.unit || "unit",
      rate,
      amount: rate * qty,
      source_product_id: p.product_id,
      source_business_id: p.business_id,
      source_business_name: p.business_name,
      customized: true,
    });
    setEditingId(null);
    setQuery("");
  }

  function addCustom() {
    const rate = Number(draft.rate || 0);
    const qty = Number(draft.qty || 1);
    if (!draft.description) return toast.error("Enter a description.");
    onAdd({
      line_id: uid("LI"),
      description: draft.description,
      qty,
      unit: draft.unit || "unit",
      rate,
      amount: rate * qty,
      customized: true,
      meta: { custom: "true" },
    });
    setDraft({ description: "", unit: "unit", rate: "", qty: "1" });
    setAddingCustom(false);
  }

  return (
    <Card className="mb-3 p-4">
      <Field label="Search products" hint="steel, agriculture, construction — any sector, any listed business">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. cement, MS plate 3mm, fertilizer…"
        />
      </Field>

      {query.trim().length >= 2 && (
        <div className="mb-3 flex flex-col gap-2">
          {results.length === 0 && (
            <p className="text-xs text-ink-muted">No listed products match — try customizing an item below.</p>
          )}
          {results.map((p) =>
            editingId === p.product_id ? (
              <div key={p.product_id} className="rounded-md border border-ink/10 p-3">
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <Field label="Description">
                    <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                  </Field>
                  <Field label="Unit">
                    <Input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
                  </Field>
                  <Field label="Rate (KSh)">
                    <Input type="number" min={0} value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} />
                  </Field>
                  <Field label="Quantity">
                    <Input type="number" min={1} value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} />
                  </Field>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => addEdited(p)}>
                    Add customized
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div key={p.product_id} className="flex items-center justify-between gap-2 rounded-md bg-canvas px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-ink-muted">
                    {p.business_name} · {money(p.selling_price)}/{p.unit || "unit"}
                    {p.category ? ` · ${p.category}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(p)}>
                    Customize
                  </Button>
                  <Button type="button" size="sm" onClick={() => addSuggestion(p)}>
                    Add
                  </Button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {addingCustom ? (
        <div className="rounded-md border border-ink/10 p-3">
          <div className="mb-2 grid grid-cols-2 gap-2">
            <Field label="Description">
              <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <Field label="Unit">
              <Input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
            </Field>
            <Field label="Rate (KSh)">
              <Input type="number" min={0} value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} />
            </Field>
            <Field label="Quantity">
              <Input type="number" min={1} value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={addCustom}>
              Add custom item
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAddingCustom(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setDraft({ description: "", unit: "unit", rate: "", qty: "1" });
            setAddingCustom(true);
          }}
        >
          + Add custom item (not in any catalog yet)
        </Button>
      )}
    </Card>
  );
}
