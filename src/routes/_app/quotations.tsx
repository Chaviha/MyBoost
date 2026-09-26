import { createFileRoute } from "@tanstack/react-router";
import { ListChecks, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { MoreActions } from "@/components/more-actions";
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
import { dxfLineTotal, DXF_MATERIALS, DXF_PROCESSES, DXF_THICKNESSES_MM, matchDxfRate, parseDXF } from "@/lib/dxf-calc";
import { formatDate, money, uid } from "@/lib/format";
import {
  catalogMassKgPerM,
  chargedMaterialKg,
  effectiveRatePerKg,
  fabCost,
  FAB_OP_LABELS,
  labourLineTotal,
  matchLabourRate,
  matchSteelProduct,
  nestBarOnStock,
  nestPlateOnStock,
  plateCutMetres,
  rolledLength,
  STEEL_CATEGORY_LABELS,
  STEEL_GRADES,
  STEEL_SPECS,
  STOCK_BAR_LENGTH_MM,
  STOCK_PLATE_SIZES,
  steelLineTotal,
  steelWeightKg,
  type ChargeMode,
  type FabOp,
  type SteelCategory,
} from "@/lib/steel-calc";
import { useLife } from "@/lib/store";
import type { MarketplaceProduct, QuoteLineItem, QuoteType } from "@/lib/types";

const QUOTE_TYPES: { value: QuoteType; label: string; blurb: string }[] = [
  { value: "general", label: "General", blurb: "A simple one-line estimate" },
  {
    value: "steel",
    label: "Steel & materials",
    blurb: "Plate (from stock sheet), RHS, CHS, shaft, cement — formulas + catalogue rates",
  },
  { value: "dxf_cut", label: "DXF Cut", blurb: "Laser/plasma cut cost from a DXF file" },
  {
    value: "custom_product",
    label: "Materials & Products",
    blurb: "Search products across LifeBoost — steel, agriculture, construction & more",
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
  // offers, regardless of sector — steel, agriculture, construction, etc.
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
                <option value="">All businesses (recommended)</option>
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
            <MoreActions actions={[{ label: "Remove item", destructive: true, icon: <Trash2 className="size-4" />, onSelect: () => onRemove(li.line_id) }]} />
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
  onAdd: (item: QuoteLineItem) => void;
}) {
  const [category, setCategory] = useState<SteelCategory | "">("");
  const [grade, setGrade] = useState("");
  const [dims, setDims] = useState<Record<string, string>>({});
  const [qty, setQty] = useState("1");
  const [rolled, setRolled] = useState(false);
  const [diameter, setDiameter] = useState("");
  const [overlap, setOverlap] = useState("50");
  const [includeLabour, setIncludeLabour] = useState(false);
  const [chargeMode, setChargeMode] = useState<ChargeMode>("cut");
  const [stockKey, setStockKey] = useState("0"); // index into STOCK_PLATE_SIZES
  const [stockBarMm, setStockBarMm] = useState(String(STOCK_BAR_LENGTH_MM));
  const [fabCut, setFabCut] = useState(false);
  const [fabBend, setFabBend] = useState(false);
  const [fabWeld, setFabWeld] = useState(false);
  const [bends, setBends] = useState("4");
  const [weldM, setWeldM] = useState("");
  const [cutRate, setCutRate] = useState(""); // KSh per metre — override if no product
  const [bendRate, setBendRate] = useState("");
  const [weldRate, setWeldRate] = useState("");

  const numericDims = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(dims)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  }, [dims]);

  const derivedLength = useMemo(() => {
    if (!rolled || !diameter) return null;
    return rolledLength(Number(diameter) || 0, Number(overlap) || 0);
  }, [rolled, diameter, overlap]);

  const effectiveDims = useMemo(() => {
    if (derivedLength !== null && (category === "rhs" || category === "shs" || category === "chs")) {
      return { ...numericDims, length: derivedLength };
    }
    return numericDims;
  }, [numericDims, derivedLength, category]);

  const match =
    category && grade ? matchSteelProduct(products, category, grade, effectiveDims) : null;
  const catalogKgM = catalogMassKgPerM(match?.product ?? null);
  const qtyN = Math.max(1, Number(qty) || 1);

  const plateNest = useMemo(() => {
    if (category !== "plates") return null;
    const stock = STOCK_PLATE_SIZES[Number(stockKey)] || STOCK_PLATE_SIZES[0];
    const length = effectiveDims.length || 0;
    const width = effectiveDims.width || 0;
    const thickness = effectiveDims.thickness || 0;
    if (!length || !width || !thickness) return null;
    return nestPlateOnStock(grade, { length, width, thickness }, qtyN, {
      width: stock.width,
      length: stock.length,
      label: stock.label,
    });
  }, [category, grade, effectiveDims, qtyN, stockKey]);

  const barNest = useMemo(() => {
    if (!category || category === "plates" || category === "cement") return null;
    const len = effectiveDims.length || 0;
    if (!len) return null;
    return nestBarOnStock(
      category,
      grade,
      effectiveDims,
      qtyN,
      Number(stockBarMm) || STOCK_BAR_LENGTH_MM,
      catalogKgM,
    );
  }, [category, grade, effectiveDims, qtyN, stockBarMm, catalogKgM]);

  const pieceWeight =
    category && grade
      ? category === "cement"
        ? steelWeightKg("cement", grade, effectiveDims)
        : plateNest?.pieceWeightKg ??
          barNest?.pieceWeightKg ??
          steelWeightKg(category, grade, effectiveDims)
      : 0;

  const materialKg = useMemo(() => {
    if (!category) return 0;
    if (category === "cement") {
      return steelWeightKg("cement", grade, effectiveDims); // total kg for bags entered
    }
    if (plateNest) return chargedMaterialKg(chargeMode, plateNest);
    if (barNest) return chargedMaterialKg(chargeMode, barNest);
    return pieceWeight * qtyN;
  }, [category, grade, effectiveDims, plateNest, barNest, chargeMode, pieceWeight, qtyN]);

  const rateInfo = match
    ? effectiveRatePerKg(match.product, category || "plates", grade, effectiveDims, catalogKgM)
    : null;

  // Cement / bag-priced items: quantity is bags, rate is per bag
  const isBagPriced =
    category === "cement" ||
    (rateInfo && (rateInfo.unit === "bag" || rateInfo.unit === "bags" || rateInfo.unit === "pcs"));
  const isSheetPriced = rateInfo?.unit === "sheet";

  let materialTotal = 0;
  if (match && rateInfo) {
    if (isBagPriced) {
      const bags = category === "cement" ? effectiveDims.bags || qtyN : qtyN;
      materialTotal = bags * match.product.selling_price;
    } else if (isSheetPriced && plateNest) {
      materialTotal = plateNest.sheetsNeeded * match.product.selling_price;
    } else {
      materialTotal = materialKg * rateInfo.ratePerKg;
    }
  }

  const thicknessForLabour =
    effectiveDims.thickness || effectiveDims.dia || effectiveDims.od || 0;
  const labourMatch =
    includeLabour && category && grade
      ? matchLabourRate(products, grade, thicknessForLabour)
      : null;
  const labourRate = labourMatch?.product.selling_price ?? 0;
  const labourTotal = labourLineTotal(
    plateNest?.chargedWeightCutKg ?? barNest?.chargedWeightCutKg ?? pieceWeight * qtyN,
    1,
    labourRate,
  );

  // Fabrication ops
  const cutMetres =
    category === "plates" && effectiveDims.length && effectiveDims.width
      ? plateCutMetres(effectiveDims.length, effectiveDims.width) * qtyN
      : category && category !== "cement" && effectiveDims.length
        ? (effectiveDims.length / 1000) * qtyN // one cut per piece approx
        : 0;
  const bendCount = Number(bends) || 0;
  const weldMetres = Number(weldM) || (category === "plates" && fabWeld ? cutMetres * 0.25 : 0);

  function rateForFab(op: FabOp, manual: string): number {
    if (manual) return Number(manual) || 0;
    const hit = products.find((p) =>
      new RegExp(op === "cut" ? "cut" : op === "bend" ? "bend" : "weld", "i").test(
        `${p.category} ${p.name}`,
      ),
    );
    return hit?.selling_price ?? 0;
  }

  const cutTotal = fabCut ? fabCost("cut", rateForFab("cut", cutRate), { metres: cutMetres }) : 0;
  const bendTotal = fabBend
    ? fabCost("bend", rateForFab("bend", bendRate), { count: bendCount * qtyN })
    : 0;
  const weldTotal = fabWeld
    ? fabCost("weld", rateForFab("weld", weldRate), { metres: weldMetres })
    : 0;
  const fabTotal = cutTotal + bendTotal + weldTotal;

  const matchedBusiness = match
    ? products.find((p) => p.product_id === match.product.product_id)
    : undefined;
  const labourBusiness = labourMatch
    ? products.find((p) => p.product_id === labourMatch.product.product_id)
    : undefined;

  function setDim(id: string, value: string) {
    setDims((prev) => ({ ...prev, [id]: value }));
  }

  function add() {
    if (!category || !grade) return toast.error("Choose category and grade.");
    if (category === "cement") {
      const bags = effectiveDims.bags || 0;
      if (!bags) return toast.error("Enter number of bags.");
      if (!match) return toast.error("No matching cement product in the catalogue.");
      onAdd({
        line_id: uid("QL"),
        description: `${grade} cement × ${bags} bag(s) (${effectiveDims.pack_kg || 50} kg)`,
        qty: bags,
        unit: "bag",
        rate: match.product.selling_price,
        amount: materialTotal,
        source_product_id: match.product.product_id,
        source_business_id: match.product.business_id,
        meta: { type: "cement", grade, bags, pack_kg: effectiveDims.pack_kg || 50 },
      });
      toast.success("Cement line added.");
      return;
    }
    if (!match) return toast.error("No matching product found for that grade / size.");
    if (pieceWeight <= 0 && !isSheetPriced) return toast.error("Enter valid dimensions.");

    const descParts = [
      STEEL_CATEGORY_LABELS[category],
      grade,
      category === "plates"
        ? `${effectiveDims.length}×${effectiveDims.width}×${effectiveDims.thickness}mm`
        : category === "chs"
          ? `OD ${effectiveDims.od} × ${effectiveDims.thickness} t × ${effectiveDims.length}mm`
          : category === "shaft"
            ? `Ø${effectiveDims.dia} × ${effectiveDims.length}mm`
            : `${effectiveDims.breadth}×${effectiveDims.width}×${effectiveDims.thickness} × ${effectiveDims.length}mm`,
    ];
    if (plateNest) {
      descParts.push(
        chargeMode === "stock"
          ? `from ${plateNest.stockLabel} (${plateNest.sheetsNeeded} sheet${plateNest.sheetsNeeded === 1 ? "" : "s"})`
          : `cut size @ ${pieceWeight.toFixed(3)} kg/pc`,
      );
    }
    if (barNest && chargeMode === "stock") {
      descParts.push(`${barNest.barsNeeded} bar(s) of ${barNest.stockLengthMm}mm`);
    }

    onAdd({
      line_id: uid("QL"),
      description: descParts.join(" · "),
      qty: isSheetPriced && plateNest ? plateNest.sheetsNeeded : qtyN,
      unit: isSheetPriced ? "sheet" : "kg",
      rate: isSheetPriced
        ? match.product.selling_price
        : rateInfo?.ratePerKg ?? match.product.selling_price,
      amount: materialTotal,
      source_product_id: match.product.product_id,
      source_business_id: match.product.business_id,
      meta: {
        type: "steel",
        category,
        grade,
        dims: effectiveDims,
        chargeMode,
        pieceWeightKg: pieceWeight,
        materialKg,
        sheets: plateNest?.sheetsNeeded ?? 0,
        bars: barNest?.barsNeeded ?? 0,
      },
    });

    if (includeLabour && labourMatch && labourTotal > 0) {
      onAdd({
        line_id: uid("QL"),
        description: `Labour — ${labourMatch.product.name}`,
        qty: 1,
        unit: "kg",
        rate: labourRate,
        amount: labourTotal,
        source_product_id: labourMatch.product.product_id,
        source_business_id: labourMatch.product.business_id,
        meta: { type: "labour", grade, thicknessMm: thicknessForLabour },
      });
    }

    if (fabCut && cutTotal > 0) {
      onAdd({
        line_id: uid("QL"),
        description: `Cutting — ${cutMetres.toFixed(2)} m`,
        qty: cutMetres,
        unit: "m",
        rate: rateForFab("cut", cutRate),
        amount: cutTotal,
        meta: { type: "fab", op: "cut" },
      });
    }
    if (fabBend && bendTotal > 0) {
      onAdd({
        line_id: uid("QL"),
        description: `Bending — ${bendCount * qtyN} bend(s)`,
        qty: bendCount * qtyN,
        unit: "bend",
        rate: rateForFab("bend", bendRate),
        amount: bendTotal,
        meta: { type: "fab", op: "bend" },
      });
    }
    if (fabWeld && weldTotal > 0) {
      onAdd({
        line_id: uid("QL"),
        description: `Welding — ${weldMetres.toFixed(2)} m`,
        qty: weldMetres,
        unit: "m",
        rate: rateForFab("weld", weldRate),
        amount: weldTotal,
        meta: { type: "fab", op: "weld" },
      });
    }

    toast.success("Line item(s) added.");
  }

  return (
    <Card className="mb-4 p-4">
      <p className="mb-3 text-sm font-medium">Steel & materials calculator</p>
      <p className="mb-3 text-xs text-ink-muted">
        Enter the <span className="font-medium text-ink">finished size</span> (e.g. plate 250×100×3 mm for a
        small box side). LifeBoost nests onto stock sheets (1220×2440…) or 6 m bars and prices from your
        catalogue products.
      </p>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <Select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as SteelCategory);
              setGrade("");
              setDims({});
            }}
          >
            <option value="">Select…</option>
            {(Object.keys(STEEL_CATEGORY_LABELS) as SteelCategory[]).map((k) => (
              <option key={k} value={k}>
                {STEEL_CATEGORY_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        {category ? (
          <Field label="Grade / class">
            <Select value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">Select…</option>
              {STEEL_GRADES[category].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      {category && grade ? (
        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEEL_SPECS[category].map((s) => (
            <Field key={s.id} label={s.label}>
              <Input
                type="number"
                min={0}
                step="any"
                value={dims[s.id] || ""}
                onChange={(e) => setDim(s.id, e.target.value)}
                placeholder={
                  s.id === "length" && category === "plates"
                    ? "250"
                    : s.id === "width" && category === "plates"
                      ? "100"
                      : s.id === "thickness"
                        ? "3"
                        : s.id === "pack_kg"
                          ? "50"
                          : ""
                }
              />
            </Field>
          ))}
        </div>
      ) : null}

      {category === "plates" && grade ? (
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <Field label="Stock sheet size">
            <Select value={stockKey} onChange={(e) => setStockKey(e.target.value)}>
              {STOCK_PLATE_SIZES.map((s, i) => (
                <option key={s.label} value={String(i)}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Charge material by">
            <Select value={chargeMode} onChange={(e) => setChargeMode(e.target.value as ChargeMode)}>
              <option value="cut">Cut size only (finished kg)</option>
              <option value="stock">Full stock sheets used</option>
            </Select>
          </Field>
        </div>
      ) : null}

      {category && category !== "plates" && category !== "cement" && grade ? (
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <Field label="Stock bar length (mm)">
            <Input
              type="number"
              min={1}
              value={stockBarMm}
              onChange={(e) => setStockBarMm(e.target.value)}
            />
          </Field>
          <Field label="Charge material by">
            <Select value={chargeMode} onChange={(e) => setChargeMode(e.target.value as ChargeMode)}>
              <option value="cut">Cut length only</option>
              <option value="stock">Full stock bars used</option>
            </Select>
          </Field>
        </div>
      ) : null}

      {category && category !== "plates" && category !== "cement" && category !== "shaft" ? (
        <div className="mb-3">
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={rolled} onChange={(e) => setRolled(e.target.checked)} />
            Rolled ring / hoop (derive length from Ø)
          </label>
          {rolled ? (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Ring diameter (mm)">
                <Input type="number" min={0} value={diameter} onChange={(e) => setDiameter(e.target.value)} />
              </Field>
              <Field label="Weld overlap (mm)">
                <Input type="number" min={0} value={overlap} onChange={(e) => setOverlap(e.target.value)} />
              </Field>
            </div>
          ) : null}
          {rolled && derivedLength !== null && diameter ? (
            <p className="mt-1 text-xs text-ink-muted">
              Ø{diameter} mm needs {(derivedLength / 1000).toFixed(2)} m of section (incl. {overlap || 0} mm
              overlap).
            </p>
          ) : null}
        </div>
      ) : null}

      {category && grade && category !== "cement" ? (
        <Field label="Quantity (pcs)">
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
      ) : null}

      {/* Formula breakdown */}
      {category && grade && pieceWeight > 0 ? (
        <div className="mb-3 rounded-lg border border-line bg-canvas p-3 text-xs text-ink-muted space-y-1">
          <p className="font-medium text-ink">Formula result</p>
          <p>
            Piece mass: <span className="tabular-nums text-ink">{pieceWeight.toFixed(3)} kg</span>
            {catalogKgM ? ` (catalogue ${catalogKgM} kg/m applied)` : " (density formula)"}
          </p>
          {plateNest ? (
            <>
              <p>
                Nest on {plateNest.stockLabel}:{" "}
                <span className="text-ink">
                  {plateNest.piecesPerSheet > 0
                    ? `${plateNest.piecesPerSheet} pc/sheet (${plateNest.orientation})`
                    : "piece larger than sheet — 1 sheet each"}
                </span>
                {" · "}
                sheets needed: <span className="text-ink">{plateNest.sheetsNeeded}</span>
                {" · "}
                utilization: <span className="text-ink">{(plateNest.utilization * 100).toFixed(0)}%</span>
              </p>
              <p>
                Material billed ({chargeMode === "cut" ? "cut size" : "full sheets"}):{" "}
                <span className="tabular-nums text-ink">{materialKg.toFixed(3)} kg</span>
              </p>
            </>
          ) : null}
          {barNest ? (
            <>
              <p>
                Nest on {barNest.stockLengthMm} mm bars:{" "}
                <span className="text-ink">
                  {barNest.piecesPerBar > 0
                    ? `${barNest.piecesPerBar} pc/bar · ${barNest.barsNeeded} bar(s)`
                    : "cut longer than stock — 1 bar each"}
                </span>
                {" · "}
                utilization: <span className="text-ink">{(barNest.utilization * 100).toFixed(0)}%</span>
              </p>
              <p>
                Material billed ({chargeMode === "cut" ? "cut length" : "full bars"}):{" "}
                <span className="tabular-nums text-ink">{materialKg.toFixed(3)} kg</span>
              </p>
            </>
          ) : null}
          {match && rateInfo ? (
            <p>
              Matched <span className="font-medium text-ink">{match.product.name}</span>
              {matchedBusiness?.business_name ? ` · ${matchedBusiness.business_name}` : ""} ·{" "}
              {money(match.product.selling_price)}/{match.product.unit || "kg"}
              {rateInfo.note !== "priced per kg" ? ` (${rateInfo.note})` : ""} · line{" "}
              <span className="font-medium text-ink">{money(materialTotal)}</span>
            </p>
          ) : (
            <p className="text-red-600">
              No catalogue product matches yet — add e.g. &quot;MS Plate 3mm&quot; under Products (price per
              kg or per sheet).
            </p>
          )}
        </div>
      ) : null}

      {category === "cement" && grade && effectiveDims.bags ? (
        <div className="mb-3 rounded-lg border border-line bg-canvas p-3 text-xs text-ink-muted">
          <p>
            {effectiveDims.bags} × {effectiveDims.pack_kg || 50} kg bags ={" "}
            <span className="text-ink">{steelWeightKg("cement", grade, effectiveDims)} kg</span>
            {match ? (
              <>
                {" "}
                · {match.product.name} @ {money(match.product.selling_price)}/bag ={" "}
                <span className="font-medium text-ink">{money(materialTotal)}</span>
              </>
            ) : (
              <span className="text-red-600"> · no cement product in catalogue</span>
            )}
          </p>
        </div>
      ) : null}

      {/* Fabrication */}
      {category && category !== "cement" && grade ? (
        <div className="mb-3 space-y-2 rounded-lg border border-line p-3">
          <p className="text-xs font-medium text-ink">Fabrication (optional)</p>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={fabCut} onChange={(e) => setFabCut(e.target.checked)} />
            {FAB_OP_LABELS.cut}
            {fabCut ? (
              <Input
                className="ml-2 h-8 max-w-[7rem]"
                type="number"
                min={0}
                placeholder="KSh/m"
                value={cutRate}
                onChange={(e) => setCutRate(e.target.value)}
              />
            ) : null}
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={fabBend} onChange={(e) => setFabBend(e.target.checked)} />
            {FAB_OP_LABELS.bend}
            {fabBend ? (
              <>
                <Input
                  className="ml-2 h-8 max-w-[5rem]"
                  type="number"
                  min={0}
                  placeholder="bends"
                  value={bends}
                  onChange={(e) => setBends(e.target.value)}
                />
                <Input
                  className="h-8 max-w-[7rem]"
                  type="number"
                  min={0}
                  placeholder="KSh/bend"
                  value={bendRate}
                  onChange={(e) => setBendRate(e.target.value)}
                />
              </>
            ) : null}
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={fabWeld} onChange={(e) => setFabWeld(e.target.checked)} />
            {FAB_OP_LABELS.weld}
            {fabWeld ? (
              <>
                <Input
                  className="ml-2 h-8 max-w-[5rem]"
                  type="number"
                  min={0}
                  placeholder="metres"
                  value={weldM}
                  onChange={(e) => setWeldM(e.target.value)}
                />
                <Input
                  className="h-8 max-w-[7rem]"
                  type="number"
                  min={0}
                  placeholder="KSh/m"
                  value={weldRate}
                  onChange={(e) => setWeldRate(e.target.value)}
                />
              </>
            ) : null}
          </label>
          {fabTotal > 0 ? (
            <p className="text-xs text-ink-muted">
              Fab subamount: <span className="font-medium text-ink">{money(fabTotal)}</span>
              {fabCut ? ` · cut ${cutMetres.toFixed(2)} m` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {category && grade && pieceWeight > 0 ? (
        <label className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={includeLabour}
            onChange={(e) => setIncludeLabour(e.target.checked)}
          />
          Add rolling / labour product (matched by grade & thickness)
        </label>
      ) : null}
      {includeLabour && category && grade && pieceWeight > 0 ? (
        <p className="mb-3 text-xs text-ink-muted">
          {labourMatch ? (
            <>
              labour: {labourMatch.product.name}
              {labourBusiness?.business_name ? ` · ${labourBusiness.business_name}` : ""} @{" "}
              {money(labourRate)}/kg = {money(labourTotal)}
            </>
          ) : (
            <span className="text-red-600">
              no labour product matched — add e.g. &quot;Rolling Labour MS 3mm&quot; or use rates above
            </span>
          )}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={add}
          disabled={
            !category ||
            !grade ||
            (category !== "cement" && pieceWeight <= 0 && !isSheetPriced) ||
            !match
          }
        >
          Add to quote
        </Button>
        {materialTotal + labourTotal + fabTotal > 0 ? (
          <span className="text-sm text-ink-muted">
            Est. line total{" "}
            <span className="font-medium text-ink">
              {money(materialTotal + (includeLabour ? labourTotal : 0) + fabTotal)}
            </span>
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function DxfBuilder({
  products,
  onAdd,
}: {
  products: MarketplaceProduct[];
  onAdd: (li: QuoteLineItem) => void;
}) {
  const [process, setProcess] = useState<string>("Laser Cut");
  const [customProcess, setCustomProcess] = useState(false);
  const [processCustom, setProcessCustom] = useState("");
  const [material, setMaterial] = useState("");
  const [customMaterial, setCustomMaterial] = useState(false);
  const [materialCustom, setMaterialCustom] = useState("");
  const [thickness, setThickness] = useState("");
  const [customThickness, setCustomThickness] = useState(false);
  const [thicknessCustom, setThicknessCustom] = useState("");
  const [fileName, setFileName] = useState("");
  const [cutLenMm, setCutLenMm] = useState(0);
  const [pierces, setPierces] = useState(0);
  const [qty, setQty] = useState("1");

  const processValue = customProcess ? processCustom.trim() : process;
  const materialValue = customMaterial ? materialCustom.trim() : material;
  const thicknessValue = customThickness ? thicknessCustom.trim() : thickness;
  const thicknessNum = Number(thicknessValue) || 0;

  async function handleFile(file: File) {
    const text = await file.text();
    const parsed = parseDXF(text);
    setFileName(file.name);
    setCutLenMm(parsed.totalLen);
    setPierces(parsed.pierces);
    toast.success(
      `DXF: ${(parsed.totalLen / 1000).toFixed(2)} m cut · ${parsed.pierces} pierces · ${parsed.entities} entities`,
    );
  }

  const rate =
    materialValue && thicknessNum > 0
      ? matchDxfRate(products, materialValue, thicknessNum, processValue)
      : null;
  const costs =
    rate && cutLenMm > 0
      ? dxfLineTotal(cutLenMm, pierces, rate, Number(qty || 1))
      : null;
  const matchedBusiness = rate?.product
    ? products.find((p) => p.product_id === rate.product?.product_id)
    : undefined;

  function add() {
    if (!processValue) return toast.error("Choose a process (Laser Cut, Engraving, …).");
    if (!materialValue) return toast.error("Choose material.");
    if (!thicknessNum) return toast.error("Choose thickness.");
    if (!cutLenMm) return toast.error("Upload a DXF or enter cut length.");
    if (!rate || !costs) return toast.error("Could not compute cost.");

    onAdd({
      line_id: uid("LI"),
      description: `${processValue} — ${materialValue} ${thicknessNum}mm${fileName ? ` (${fileName})` : ""}`,
      qty: Number(qty || 1),
      unit: "job",
      rate: costs.total / Number(qty || 1),
      amount: costs.total,
      source_product_id: rate.product?.product_id,
      source_business_id: matchedBusiness?.business_id,
      source_business_name: matchedBusiness?.business_name,
      meta: {
        process: processValue,
        material: materialValue,
        thickness: thicknessNum,
        cutLenM: Number((cutLenMm / 1000).toFixed(2)),
        pierces,
        rateSource: rate.source,
      },
    });
    setFileName("");
    setCutLenMm(0);
    setPierces(0);
    setQty("1");
    toast.success("Cut line added.");
  }

  return (
    <Card className="mb-3 p-4">
      <p className="mb-2 text-sm font-medium">DXF / CNC / engraver / punch pricing</p>
      <p className="mb-3 text-xs text-ink-muted">
        Pick <span className="font-medium text-ink">process · material · thickness</span> from the
        lists (or Customize). Cutting companies list products as{" "}
        <span className="font-medium text-ink">&quot;Laser Cut Mild Steel 3mm&quot;</span>,{" "}
        <span className="font-medium text-ink">&quot;Engraving Acrylic 5mm&quot;</span>,{" "}
        <span className="font-medium text-ink">&quot;Punching Mild Steel 2mm&quot;</span> (unit: m).
      </p>

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <Field label="Process">
          {customProcess ? (
            <div className="flex gap-1">
              <Input
                value={processCustom}
                onChange={(e) => setProcessCustom(e.target.value)}
                placeholder="e.g. Laser Engrave"
              />
              <Button type="button" size="sm" variant="ghost" onClick={() => setCustomProcess(false)}>
                List
              </Button>
            </div>
          ) : (
            <Select
              value={process}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setCustomProcess(true);
                  setProcessCustom("");
                } else setProcess(e.target.value);
              }}
            >
              {DXF_PROCESSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value="__custom__">Customize…</option>
            </Select>
          )}
        </Field>

        <Field label="Material">
          {customMaterial ? (
            <div className="flex gap-1">
              <Input
                value={materialCustom}
                onChange={(e) => setMaterialCustom(e.target.value)}
                placeholder="e.g. Titanium"
              />
              <Button type="button" size="sm" variant="ghost" onClick={() => setCustomMaterial(false)}>
                List
              </Button>
            </div>
          ) : (
            <Select
              value={material}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setCustomMaterial(true);
                  setMaterialCustom("");
                } else setMaterial(e.target.value);
              }}
            >
              <option value="">Select…</option>
              {DXF_MATERIALS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="__custom__">Customize…</option>
            </Select>
          )}
        </Field>

        <Field label="Thickness (mm)">
          {customThickness ? (
            <div className="flex gap-1">
              <Input
                type="number"
                min={0}
                step="any"
                value={thicknessCustom}
                onChange={(e) => setThicknessCustom(e.target.value)}
                placeholder="e.g. 3.2"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setCustomThickness(false)}
              >
                List
              </Button>
            </div>
          ) : (
            <Select
              value={thickness}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setCustomThickness(true);
                  setThicknessCustom("");
                } else setThickness(e.target.value);
              }}
            >
              <option value="">Select…</option>
              {DXF_THICKNESSES_MM.map((t) => (
                <option key={t} value={String(t)}>
                  {t} mm
                </option>
              ))}
              <option value="__custom__">Customize…</option>
            </Select>
          )}
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
          {(cutLenMm / 1000).toFixed(2)} m path length · {pierces} pierces
        </p>
      )}

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Field label="Cut / path length (m)">
          <Input
            type="number"
            min={0}
            value={cutLenMm ? (cutLenMm / 1000).toFixed(2) : ""}
            onChange={(e) => setCutLenMm(Number(e.target.value || 0) * 1000)}
          />
        </Field>
        <Field label="Pierces">
          <Input
            type="number"
            min={0}
            value={pierces || ""}
            onChange={(e) => setPierces(Number(e.target.value || 0))}
          />
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
              {rate.note ? ` (${rate.note})` : ""}
            </>
          ) : (
            <span>
              no company matched for {processValue} · {materialValue} · {thicknessNum}mm — using
              typical rates. List products as &quot;{processValue} {materialValue} {thicknessNum}
              mm&quot; (unit: m).
            </span>
          )}
          {" · "}pierce {money(costs.pierceCost)} + path {money(costs.cutCost)} ={" "}
          <span className="font-medium text-ink">{money(costs.total)}</span>
        </p>
      )}

      <Button
        type="button"
        variant="ghost"
        onClick={add}
        disabled={!materialValue || !thicknessNum || !cutLenMm}
      >
        Add to quote
      </Button>
    </Card>
  );
}

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
      <Field label="Search products" hint="steel, agriculture, construction — any sector, any business">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. cement, MS plate 3mm, fertilizer…"
        />
      </Field>

      {query.trim().length >= 2 && (
        <div className="mb-3 flex flex-col gap-2">
          {results.length === 0 && (
            <p className="text-xs text-ink-muted">No products match — try customizing an item below.</p>
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
