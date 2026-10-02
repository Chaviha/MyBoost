import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  Download,
  ListChecks,
  Pencil,
  Printer,
  Search,
  Store,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { downloadQuoteHtml, printQuotePdf } from "@/lib/quote-export";
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
import type { MarketplaceProduct, Quotation, QuoteLineItem, QuoteType } from "@/lib/types";

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

function statusTone(status: string): "forest" | "amber" | "neutral" | "red" {
  if (status === "Accepted") return "forest";
  if (status === "Rejected") return "red";
  if (status === "Sent") return "amber";
  return "neutral";
}

function QuotationsPage() {
  const {
    selectedBusiness,
    businessQuotes,
    businessCustomers,
    addQuotation,
    updateQuotation,
    acceptQuotation,
    rejectQuotation,
    ensureQuoteShareToken,
    can,
  } = useLife();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Quotation | null>(null);
  const [reviewing, setReviewing] = useState<Quotation | null>(null);
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const qSearch = search.trim().toLowerCase();
  // User-controlled date order
  const sortedQuotes = useMemo(
    () =>
      [...businessQuotes].sort((a, b) => {
        const da = +new Date(a.date) || 0;
        const db = +new Date(b.date) || 0;
        if (da !== db) return sortDir === "asc" ? da - db : db - da;
        return String(a.quote_id).localeCompare(String(b.quote_id));
      }),
    [businessQuotes, sortDir],
  );

  const filteredQuotes = useMemo(() => {
    if (!qSearch) return sortedQuotes;
    return sortedQuotes.filter((q) => {
      const hay = [
        q.customer_name,
        q.notes,
        q.status,
        q.quote_id,
        q.quote_type,
        q.pricing_business_name,
        money(q.total),
        ...(q.line_items || []).map((li) => li.description),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qSearch);
    });
  }, [sortedQuotes, qSearch]);

  if (!can("manage_quotes")) {
    return <AccessDenied need="Quotations are for business owners." />;
  }
  if (!selectedBusiness) return <EmptyState icon={ListChecks} text="Add a business first." />;

  const bizExport = {
    business_name: selectedBusiness.business_name,
    phone: selectedBusiness.phone,
    email: selectedBusiness.email,
    region: selectedBusiness.region,
  };

  function quoteReviewUrl(q: Quotation): string {
    const token = q.share_token || ensureQuoteShareToken(q.quote_id);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/quote/${encodeURIComponent(token)}`;
  }

  function shareWhatsApp(q: Quotation) {
    const customer = businessCustomers.find((c) => c.customer_id === q.customer_id);
    const link = quoteReviewUrl(q);
    const text = encodeURIComponent(
      `Hello ${q.customer_name},\n\n${selectedBusiness!.business_name} sent you a quotation for ${money(q.total)}.\n\nReview & Accept here:\n${link}`,
    );
    const phone = (customer?.phone || "").replace(/\D/g, "");
    const url = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success(phone ? "Opening WhatsApp to customer…" : "Opening WhatsApp — pick the customer chat.");
  }

  async function shareEmail(q: Quotation) {
    const customer = businessCustomers.find((c) => c.customer_id === q.customer_id);
    const link = quoteReviewUrl(q);
    const token = q.share_token || ensureQuoteShareToken(q.quote_id);
    // Prefer server email when SMTP is configured
    try {
      const res = await fetch(`/api/public/quote/${encodeURIComponent(token)}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: customer?.email || "",
          origin: window.location.origin,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Email sent to ${data.to || customer?.email}`);
        return;
      }
      // Fallback to mailto
      if (res.status === 503 || res.status === 400) {
        const subject = encodeURIComponent(`Quotation from ${selectedBusiness!.business_name}`);
        const body = encodeURIComponent(
          `Hello ${q.customer_name},\n\nPlease review your quotation (${money(q.total)}):\n${link}\n`,
        );
        const to = customer?.email || "";
        window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
        toast.message(data.error || "Opened email app — SMTP not configured on server.");
        return;
      }
      throw new Error(data.error || "Email failed");
    } catch (e) {
      const subject = encodeURIComponent(`Quotation from ${selectedBusiness!.business_name}`);
      const body = encodeURIComponent(
        `Hello ${q.customer_name},\n\nPlease review your quotation (${money(q.total)}):\n${link}\n`,
      );
      window.location.href = `mailto:${customer?.email || ""}?subject=${subject}&body=${body}`;
      toast.message(e instanceof Error ? e.message : "Opened email app.");
    }
  }

  async function copyReviewLink(q: Quotation) {
    const link = quoteReviewUrl(q);
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Review link copied.");
    } catch {
      toast.message(link);
    }
  }

  return (
    <>
      <Toolbar
        title="Quotations"
        subtitle={`Estimates sent from ${selectedBusiness.business_name}`}
        actionLabel="New quotation"
        onAction={() => {
          setEditing(null);
          setOpen(true);
        }}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, notes, status, amount…"
            aria-label="Search quotations"
          />
        </div>
        <Select
          value={sortDir}
          onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
          aria-label="Sort order"
          className="w-auto min-w-[10rem]"
        >
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </Select>
        {search.trim() ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setSearch("")}>
            Clear
          </Button>
        ) : null}
      </div>

      {businessQuotes.length === 0 ? (
        <EmptyState icon={ListChecks} text="No quotations yet." />
      ) : filteredQuotes.length === 0 ? (
        <EmptyState icon={Search} text={`No quotations match “${search.trim()}”.`} />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredQuotes.map((q) => {
            const suppliers = Array.from(
              new Set((q.line_items || []).map((li) => li.source_business_name).filter(Boolean)),
            ) as string[];
            const supplierLabel = suppliers.length
              ? suppliers.length === 1
                ? suppliers[0]
                : `${suppliers.length} suppliers (${suppliers.join(", ")})`
              : q.pricing_business_name;
            const lines = q.line_items?.length ?? 0;
            return (
              <Card key={q.quote_id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{q.customer_name}</p>
                  <p className="text-xs text-ink-muted">
                    {q.notes || formatDate(q.date)}
                    {supplierLabel ? ` · priced from ${supplierLabel}` : ""}
                    {lines ? ` · ${lines} line${lines === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {q.quote_type && q.quote_type !== "general" ? (
                    <Badge tone="neutral">
                      {QUOTE_TYPES.find((t) => t.value === q.quote_type)?.label ?? q.quote_type}
                    </Badge>
                  ) : null}
                  <p className="font-medium tabular-nums">{money(q.total)}</p>
                  <Badge tone={statusTone(q.status)}>{q.status}</Badge>
                  <MoreActions
                    label="Quote actions"
                    actions={[
                      ...(q.status === "Sent" || q.status === "Draft"
                        ? [
                            {
                              label: "Review & Accept",
                              icon: <CheckCircle2 className="size-4" />,
                              onSelect: () => setReviewing(q),
                            },
                            {
                              label: "Reject",
                              icon: <XCircle className="size-4" />,
                              destructive: true,
                              onSelect: () => {
                                rejectQuotation(q.quote_id);
                                toast.message("Quotation rejected — no charge posted.");
                              },
                            },
                          ]
                        : []),
                      {
                        label: "Send WhatsApp",
                        onSelect: () => shareWhatsApp(q),
                      },
                      {
                        label: "Send Email",
                        onSelect: () => void shareEmail(q),
                      },
                      {
                        label: "Copy review link",
                        onSelect: () => void copyReviewLink(q),
                      },
                      {
                        label: "Edit",
                        icon: <Pencil className="size-4" />,
                        onSelect: () => {
                          setEditing(q);
                          setOpen(true);
                        },
                      },
                      {
                        label: "Download HTML",
                        icon: <Download className="size-4" />,
                        onSelect: () => {
                          downloadQuoteHtml(q, bizExport);
                          toast.success("HTML quotation downloaded.");
                        },
                      },
                      {
                        label: "Print / Save PDF",
                        icon: <Printer className="size-4" />,
                        onSelect: () => {
                          printQuotePdf(q, bizExport);
                          toast.message("Use Print → Save as PDF in the dialog.");
                        },
                      },
                    ]}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review & Accept */}
      <Dialog
        open={Boolean(reviewing)}
        onOpenChange={(v) => {
          if (!v) setReviewing(null);
        }}
      >
        <DialogContent className="w-[min(calc(100%-2rem),36rem)] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review & Accept</DialogTitle>
          </DialogHeader>
          {reviewing ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-line bg-canvas/50 p-3 text-sm">
                <p className="font-medium">{reviewing.customer_name}</p>
                <p className="text-xs text-ink-muted mt-1">
                  {formatDate(reviewing.date)} · {reviewing.quote_id}
                  {reviewing.notes ? ` · ${reviewing.notes}` : ""}
                </p>
              </div>
              {(reviewing.line_items || []).length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs text-ink-muted">
                        <th className="p-2 font-medium">Description</th>
                        <th className="p-2 font-medium text-right">Qty</th>
                        <th className="p-2 font-medium text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reviewing.line_items || []).map((li) => (
                        <tr key={li.line_id} className="border-b border-line/60">
                          <td className="p-2">{li.description}</td>
                          <td className="p-2 text-right tabular-nums">
                            {li.qty} {li.unit}
                          </td>
                          <td className="p-2 text-right tabular-nums">{money(li.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">No line items — total only.</p>
              )}
              <div className="flex items-center justify-between border-t border-line pt-3">
                <span className="text-sm text-ink-muted">Total to charge customer</span>
                <span className="text-lg font-semibold tabular-nums">{money(reviewing.total)}</span>
              </div>
              <p className="text-xs text-ink-muted">
                Accepting posts this amount to <strong>{reviewing.customer_name}</strong>&apos;s
                customer tab and ledger. Payments on Customers will reduce the balance.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setReviewing(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    rejectQuotation(reviewing.quote_id);
                    toast.message("Quotation rejected — no charge posted.");
                    setReviewing(null);
                  }}
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    acceptQuotation(reviewing.quote_id);
                    toast.success(
                      `Accepted — ${money(reviewing.total)} charged to ${reviewing.customer_name}.`,
                    );
                    setReviewing(null);
                  }}
                >
                  Accept & charge customer
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            setOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="w-[min(calc(100%-2rem),42rem)] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit quotation" : "New quotation"}</DialogTitle>
          </DialogHeader>
          <QuoteWizard
            key={editing?.quote_id || "new"}
            customers={businessCustomers}
            initial={
              editing
                ? {
                    customerId: editing.customer_id,
                    total: String(editing.total),
                    notes: editing.notes || "",
                    quoteType: editing.quote_type || "general",
                    pricingBusinessId: editing.pricing_business_id,
                    lineItems: editing.line_items || [],
                  }
                : undefined
            }
            onCancel={() => {
              setOpen(false);
              setEditing(null);
            }}
            onSubmit={(form) => {
              if (editing) {
                updateQuotation(editing.quote_id, form);
                toast.success(
                  editing.status === "Accepted"
                    ? "Quotation updated — customer balance adjusted."
                    : "Quotation updated.",
                );
              } else {
                addQuotation(form);
                toast.success("Quotation sent — review & accept to charge the customer.");
              }
              setOpen(false);
              setEditing(null);
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
  initial,
}: {
  customers: { customer_id: string; name: string }[];
  onCancel: () => void;
  onSubmit: (form: WizardForm) => void;
  initial?: WizardForm;
}) {
  const { publicMarketplace, selectedBusiness, businessProducts, businessServices } = useLife();
  const [quoteType, setQuoteType] = useState<QuoteType | null>(initial?.quoteType ?? null);
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [businessFilter, setBusinessFilter] = useState(
    initial?.pricingBusinessId ?? selectedBusiness?.business_id ?? "",
  );
  const [generalTotal, setGeneralTotal] = useState(initial?.total ?? "");
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>(initial?.lineItems ?? []);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");
  const [steelMode, setSteelMode] = useState<"catalogue" | "advanced">("catalogue");

  // Own catalogue (products + services) first, then public marketplace
  const ownAsMarketplace: MarketplaceProduct[] = useMemo(
    () =>
      [...(businessProducts || [])].map((p) => ({
        product_id: p.product_id,
        business_id: p.business_id,
        business_name: selectedBusiness?.business_name || "My business",
        name: p.name,
        category: p.category,
        unit: p.unit,
        selling_price: p.selling_price,
        specs: p.specs,
      })),
    [businessProducts, selectedBusiness?.business_name],
  );

  const allListedProducts = useMemo(() => {
    const byId = new Map<string, MarketplaceProduct>();
    for (const p of ownAsMarketplace) byId.set(p.product_id, p);
    for (const p of publicMarketplace.products) {
      if (!byId.has(p.product_id)) byId.set(p.product_id, p);
    }
    return Array.from(byId.values());
  }, [ownAsMarketplace, publicMarketplace.products]);

  const catalogBusinesses = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allListedProducts) map.set(p.business_id, p.business_name);
    return Array.from(map, ([business_id, business_name]) => ({ business_id, business_name }));
  }, [allListedProducts]);
  const catalog = useMemo(
    () =>
      businessFilter
        ? allListedProducts.filter((p) => p.business_id === businessFilter)
        : allListedProducts,
    [allListedProducts, businessFilter],
  );

  /**
   * All rates from the Services tab (item_kind = service), always from the
   * selected business — not filtered by name keywords so every service shows up.
   */
  const serviceCatalog = useMemo(() => {
    const fromServicesTab = (businessServices || []).map((p) => ({
      product_id: p.product_id,
      business_id: p.business_id,
      business_name: selectedBusiness?.business_name || "My business",
      name: p.name,
      category: p.category || "Service",
      unit: p.unit,
      selling_price: p.selling_price,
      specs: p.specs,
    }));
    // Also any catalog row that looks like a rate (unit hour/km/m/job) so products
    // entered under Products still appear if the shop listed rates there.
    const rateLike = catalog.filter((p) => {
      const u = (p.unit || "").toLowerCase();
      return (
        /hour|hr|km|m²|m2|\/m|metre|meter|pierce|job|day|tonne/i.test(u) ||
        /labour|labor|weld|cut|laser|plasma|cnc|transport|deliver|haul|paint|spray|fabricat/i.test(
          `${p.category} ${p.name}`,
        )
      );
    });
    const byId = new Map<string, MarketplaceProduct>();
    for (const p of fromServicesTab) byId.set(p.product_id, p);
    for (const p of rateLike) byId.set(p.product_id, p);
    return Array.from(byId.values());
  }, [businessServices, selectedBusiness?.business_name, catalog]);

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
          setSelectedMaterialId("");
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

          {quoteType === "steel" && (
            <>
              <div className="mb-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={steelMode === "catalogue" ? undefined : "ghost"}
                  onClick={() => setSteelMode("catalogue")}
                >
                  Catalogue search
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={steelMode === "advanced" ? undefined : "ghost"}
                  onClick={() => setSteelMode("advanced")}
                >
                  Advanced calculator
                </Button>
              </div>

              {steelMode === "catalogue" ? (
                <CatalogueQuoteBuilder products={catalog} onAdd={addLineItem} />
              ) : !selectedMaterialId ? (
                <SteelMaterialPicker
                  products={catalog}
                  onSelect={(p) => setSelectedMaterialId(p.product_id)}
                />
              ) : (
                <>
                  <SelectedMaterialCard
                    product={catalog.find((p) => p.product_id === selectedMaterialId)}
                    onChange={() => setSelectedMaterialId("")}
                  />
                  <SteelBuilder
                    key={selectedMaterialId}
                    products={catalog}
                    selectedProductId={selectedMaterialId}
                    onAdd={addLineItem}
                  />
                </>
              )}
              {/* Rendered once for every steel quote */}
              <FabricationCostBuilder
                products={catalog}
                services={serviceCatalog}
                onAdd={addLineItem}
              />
            </>
          )}
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

// ── Material selection before steel quotation ─────────────────────────────
function steelSearchText(p: MarketplaceProduct): string {
  const specs = Object.entries(p.specs || {}).map(([k, v]) => `${k} ${v}`).join(" ");
  return `${p.name} ${p.category} ${p.unit} ${specs}`.toLowerCase();
}

function SteelMaterialPicker({
  products,
  onSelect,
}: {
  products: MarketplaceProduct[];
  onSelect: (product: MarketplaceProduct) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const steelProducts = useMemo(() => products.filter((p) => {
    const text = steelSearchText(p);
    return /steel|rhs|shs|angle|beam|channel|pipe|bar|flat|mesh|plate|section|ipe|ub|uc/i.test(text);
  }), [products]);
  const categories = useMemo(() => Array.from(new Set(steelProducts.map((p) => p.category).filter(Boolean))).sort(), [steelProducts]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return steelProducts
      .filter((p) => category === "all" || p.category === category)
      .filter((p) => !q || steelSearchText(p).includes(q))
      .sort((a, b) => {
        const am = catalogMassKgPerM(a) ? 1 : 0;
        const bm = catalogMassKgPerM(b) ? 1 : 0;
        return bm - am || a.name.localeCompare(b.name);
      })
      .slice(0, 30);
  }, [steelProducts, query, category]);

  return (
    <Card className="mb-4 p-4">
      <div className="mb-3">
        <p className="text-sm font-medium">Select material</p>
        <p className="text-xs text-ink-muted">Search the steel catalogue, select the exact material/section, then continue to the quotation.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search e.g. RHS 100x50x3, 50 NB, SHS 50x50, angle, IPE 200…"
          autoFocus
        />
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All steel</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-ink/10 divide-y divide-ink/10">
        {results.length ? results.map((p) => {
          const kgm = catalogMassKgPerM(p);
          return (
            <button
              key={p.product_id}
              type="button"
              onClick={() => onSelect(p)}
              className="w-full p-3 text-left hover:bg-leaf/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">{p.name}</p>
                  <p className="text-xs text-ink-muted">{p.category}{p.business_name ? ` · ${p.business_name}` : ""}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {kgm ? <span className="font-medium text-ink">Catalogue: {kgm} kg/m</span> : "Catalogue weight reference not set"}
                    {p.specs?.standard ? ` · ${p.specs.standard}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-md border border-ink/10 px-2 py-1 text-xs">Select</span>
              </div>
            </button>
          );
        }) : (
          <p className="p-4 text-sm text-ink-muted">No steel material found. Try a size, designation, NB, OD, thickness, or product name.</p>
        )}
      </div>
    </Card>
  );
}

function SelectedMaterialCard({ product, onChange }: { product?: MarketplaceProduct; onChange: () => void }) {
  if (!product) return null;
  const kgm = catalogMassKgPerM(product);
  return (
    <Card className="mb-3 border-forest/20 bg-leaf/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-ink-muted">Selected material</p>
          <p className="font-medium">{product.name}</p>
          <p className="text-xs text-ink-muted">{product.category}{kgm ? ` · ${kgm} kg/m catalogue reference` : ""}</p>
        </div>
        <Button type="button" variant="ghost" onClick={onChange}>Change</Button>
      </div>
    </Card>
  );
}

// ── Catalogue-driven steel quoting ───────────────────────────────────────
// Search a product → see its catalogue details + price per stock piece (tube / sheet)
// and the hardware that stocks it → customise length (and width) + qty → add → search another.
const SEARCH_SYNONYMS: Record<string, string[]> = {
  rhs: ["rectangular hollow"],
  shs: ["square hollow"],
  chs: ["round hollow", "pipe"],
  ub: ["universal beam"],
  uc: ["universal column"],
  tmt: ["rebar", "tmt"],
  rebar: ["tmt", "rebar"],
  gi: ["galvanized", "galvanised"],
  ms: ["ms", "mild steel"],
  galvanised: ["galvanized", "galvanised"],
  galvanized: ["galvanized", "galvanised"],
};
const STEEL_RE =
  /steel|rhs|shs|chs|hollow|pipe|tube|bar|rebar|tmt|flat|angle|beam|channel|column|section|purlin|zed|plate|sheet|mesh|brc|wire|nail|coil|ipe/i;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** lower-case, "100 x 50 x 3" → "100x50x3", drop inch quotes */
function normSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/(\d)\s*[x×]\s*(?=\d)/g, "$1x")
    .replace(/["\u2033\u201d\u0027]/g, "");
}

function productMatches(p: MarketplaceProduct, query: string): boolean {
  const tokens = normSearch(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = normSearch(`${steelSearchText(p)} ${p.business_name}`);
  return tokens.every(
    (t) => hay.includes(t) || (SEARCH_SYNONYMS[t] || []).some((s) => hay.includes(s)),
  );
}

type CatalogueModel = {
  kind: "linear" | "plate" | "unit";
  unit: string;
  /** what one stock piece is called: tube / bar / length / sheet / <unit> */
  pieceLabel: string;
  /** catalogue price of ONE stock piece (tube, sheet) or one unit */
  basePrimary: number;
  stockLengthM: number; // linear
  stockLmm: number; // plate length or linear length (mm)
  stockWmm: number; // plate width (mm)
  kgPerM: number;
  kgPerSheet: number;
};

function catalogueModel(p: MarketplaceProduct): CatalogueModel {
  const specs = p.specs || {};
  const unit = (p.unit || "").toLowerCase().trim();
  const text = `${p.category} ${p.name}`.toLowerCase();
  const price = Number(p.selling_price) || 0;
  const kgPerM = num(specs.mass_kg_m ?? specs.kg_m);
  const kgPerSheet = num(specs.mass_kg);
  const lenSpecM = num(specs.length_m ?? specs.standard_length_m);
  const base = { unit: p.unit || "unit", stockLengthM: 0, stockLmm: 0, stockWmm: 0, kgPerM, kgPerSheet };

  const isSheetUnit = ["sheet", "sheets", "pc sheet"].includes(unit);
  const pieceUnit = ["pc", "pcs", "piece", "length", "tube", "bar"].includes(unit);
  const plateLike =
    isSheetUnit || (/plate|sheet|chequer/.test(text) && num(specs.length) && num(specs.width));
  if (plateLike && (isSheetUnit || pieceUnit || (unit === "kg" && kgPerSheet))) {
    const sl = num(specs.length) || num(specs.length_m) * 1000 || 2438;
    const sw = num(specs.width) || num(specs.width_m) * 1000 || 1219;
    return {
      ...base,
      kind: "plate",
      pieceLabel: "sheet",
      basePrimary: unit === "kg" ? price * kgPerSheet : price,
      stockLmm: sl,
      stockWmm: sw,
    };
  }

  const linearUnit = ["m", "metre", "meter", "lm"].includes(unit);
  if (linearUnit || (unit === "kg" && kgPerM) || (pieceUnit && lenSpecM)) {
    const stock = lenSpecM || 6;
    const pricePerM = linearUnit ? price : unit === "kg" ? price * kgPerM : price / stock;
    const pieceLabel = /pipe|hollow|rhs|shs|chs|tube/.test(text)
      ? "tube"
      : /bar|rebar|tmt|flat/.test(text)
        ? "bar"
        : "length";
    return {
      ...base,
      kind: "linear",
      pieceLabel,
      basePrimary: pricePerM * stock,
      stockLengthM: stock,
      stockLmm: stock * 1000,
    };
  }

  return { ...base, kind: "unit", pieceLabel: p.unit || "unit", basePrimary: price };
}

function catalogueSummary(p: MarketplaceProduct): string {
  const m = catalogueModel(p);
  if (m.basePrimary <= 0) return "Price not set";
  if (m.kind === "linear") {
    return `${money(m.basePrimary)} per ${m.stockLengthM} m ${m.pieceLabel} · ${money(m.basePrimary / m.stockLengthM)}/m${m.kgPerM ? ` · ${m.kgPerM} kg/m` : ""}`;
  }
  if (m.kind === "plate") {
    return `${money(m.basePrimary)} per sheet (${m.stockLmm}×${m.stockWmm} mm)${m.kgPerSheet ? ` · ${m.kgPerSheet} kg` : ""}`;
  }
  return `${money(m.basePrimary)} per ${m.unit}`;
}

function CatalogueQuoteBuilder({
  products,
  onAdd,
}: {
  products: MarketplaceProduct[];
  onAdd: (li: QuoteLineItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [hardware, setHardware] = useState("all");
  const [selectedId, setSelectedId] = useState("");

  const steelProducts = useMemo(
    () => products.filter((p) => STEEL_RE.test(steelSearchText(p))),
    [products],
  );
  const hardwares = useMemo(
    () => Array.from(new Set(steelProducts.map((p) => p.business_name).filter(Boolean))).sort(),
    [steelProducts],
  );
  const results = useMemo(() => {
    if (!query.trim() && hardware === "all") return [];
    return steelProducts
      .filter((p) => hardware === "all" || p.business_name === hardware)
      .filter((p) => !query.trim() || productMatches(p, query))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.selling_price - b.selling_price)
      .slice(0, 25);
  }, [steelProducts, query, hardware]);
  const selected = selectedId ? products.find((p) => p.product_id === selectedId) : undefined;

  return (
    <Card className="mb-4 p-4">
      <div className="mb-3">
        <p className="text-sm font-medium">Search catalogue</p>
        <p className="text-xs text-ink-muted">
          Find a product, check its catalogue price and the hardware that stocks it, then set the
          length / width and quantity. Add as many products as you need.
        </p>
      </div>

      {selected ? (
        <CatalogueLineEditor
          key={selected.product_id}
          product={selected}
          onCancel={() => setSelectedId("")}
          onAdd={(li) => {
            onAdd(li);
            setSelectedId("");
            toast.success("Added — search another product or continue.");
          }}
        />
      ) : (
        <>
          <div className={`grid gap-3 ${hardwares.length > 1 ? "sm:grid-cols-[1fr_auto]" : ""}`}>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search e.g. RHS 100x50x3, plate 3mm, angle 50x50, IPE 200, TMT 12…"
              autoFocus
            />
            {hardwares.length > 1 ? (
              <Select value={hardware} onChange={(e) => setHardware(e.target.value)}>
                <option value="all">All hardwares</option>
                {hardwares.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>

          <div className="mt-3 max-h-80 divide-y divide-ink/10 overflow-y-auto rounded-lg border border-ink/10">
            {!query.trim() && hardware === "all" ? (
              <p className="p-4 text-sm text-ink-muted">
                Type a product name or size to search (RHS, SHS, plate, angle, beam, pipe, rebar…).
              </p>
            ) : results.length ? (
              results.map((p) => (
                <button
                  key={p.product_id}
                  type="button"
                  onClick={() => setSelectedId(p.product_id)}
                  className="w-full p-3 text-left hover:bg-leaf/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{p.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                        <Store className="size-3 shrink-0" />
                        <span className="font-medium text-ink">{p.business_name}</span>
                        {p.category ? <span>· {p.category}</span> : null}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">{catalogueSummary(p)}</p>
                    </div>
                    <span className="shrink-0 rounded-md border border-ink/10 px-2 py-1 text-xs">Select</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="p-4 text-sm text-ink-muted">
                No product found. Try a size (e.g. 100x50x3), a type (RHS, SHS, plate, angle) or another hardware.
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function CatalogueLineEditor({
  product,
  onAdd,
  onCancel,
}: {
  product: MarketplaceProduct;
  onAdd: (li: QuoteLineItem) => void;
  onCancel: () => void;
}) {
  const m = useMemo(() => catalogueModel(product), [product]);
  const [lengthMm, setLengthMm] = useState(String(m.stockLmm || ""));
  const [widthMm, setWidthMm] = useState(String(m.stockWmm || ""));
  const [qty, setQty] = useState("1");
  const [charge, setCharge] = useState<"cut" | "stock">("cut");
  const [override, setOverride] = useState("");

  const q = Math.max(1, Math.floor(Number(qty) || 1));
  const L = Number(lengthMm) || 0;
  const W = Number(widthMm) || 0;
  const primary = Number(override) > 0 ? Number(override) : m.basePrimary;
  const customizedPrice = Number(override) > 0 && Number(override) !== m.basePrimary;

  // ── linear (tubes, bars, sections priced per metre / per length) ──
  const pricePerM = m.kind === "linear" ? primary / m.stockLengthM : 0;
  const totalM = (L / 1000) * q;
  const tubesNeeded =
    m.kind !== "linear" || L <= 0
      ? 0
      : L <= m.stockLmm
        ? Math.ceil(q / Math.max(1, Math.floor(m.stockLmm / L)))
        : q * Math.ceil(L / m.stockLmm);
  const offcutM = m.kind === "linear" ? Math.max(0, tubesNeeded * m.stockLengthM - totalM) : 0;
  const weightKg = m.kind === "linear" && m.kgPerM ? totalM * m.kgPerM : 0;

  // ── plate / sheet ──
  const stockAreaM2 = (m.stockLmm * m.stockWmm) / 1_000_000;
  const pricePerM2 = m.kind === "plate" && stockAreaM2 > 0 ? primary / stockAreaM2 : 0;
  const pieceAreaM2 = (L * W) / 1_000_000;
  const totalAreaM2 = pieceAreaM2 * q;
  const perSheet =
    m.kind === "plate" && L > 0 && W > 0
      ? Math.max(
          Math.floor(m.stockLmm / L) * Math.floor(m.stockWmm / W),
          Math.floor(m.stockLmm / W) * Math.floor(m.stockWmm / L),
        )
      : 0;
  const sheetsNeeded =
    m.kind !== "plate" || pieceAreaM2 <= 0
      ? 0
      : perSheet > 0
        ? Math.ceil(q / perSheet)
        : Math.max(1, Math.ceil(totalAreaM2 / stockAreaM2));
  const plateWeightKg = m.kind === "plate" && m.kgPerSheet && stockAreaM2 > 0 ? totalAreaM2 * (m.kgPerSheet / stockAreaM2) : 0;

  // ── amount ──
  let amount = 0;
  let lineQty = q;
  let lineUnit = m.unit;
  let lineRate = primary;
  if (m.kind === "linear") {
    if (charge === "stock") {
      lineQty = tubesNeeded; lineUnit = m.pieceLabel; lineRate = primary; amount = tubesNeeded * primary;
    } else {
      lineQty = Number(totalM.toFixed(3)); lineUnit = "m"; lineRate = pricePerM; amount = totalM * pricePerM;
    }
  } else if (m.kind === "plate") {
    if (charge === "stock") {
      lineQty = sheetsNeeded; lineUnit = "sheet"; lineRate = primary; amount = sheetsNeeded * primary;
    } else {
      lineQty = Number(totalAreaM2.toFixed(3)); lineUnit = "m²"; lineRate = pricePerM2; amount = totalAreaM2 * pricePerM2;
    }
  } else {
    lineQty = q; lineUnit = m.unit; lineRate = primary; amount = q * primary;
  }

  const sizeText =
    m.kind === "linear"
      ? `${L}mm × ${q} pc${q === 1 ? "" : "s"}`
      : m.kind === "plate"
        ? `${L}×${W}mm × ${q} pc${q === 1 ? "" : "s"}`
        : `× ${q}`;

  function add() {
    if (primary <= 0) return toast.error("This product has no price in the catalogue — enter a price below.");
    if (m.kind === "linear" && L <= 0) return toast.error("Enter a length.");
    if (m.kind === "plate" && (L <= 0 || W <= 0)) return toast.error("Enter length and width.");
    onAdd({
      line_id: uid("QL"),
      description: `${product.name} — ${sizeText}${charge === "stock" && m.kind !== "unit" ? ` (full ${lineUnit}s billed)` : ""}`,
      qty: lineQty,
      unit: lineUnit,
      rate: lineRate,
      amount,
      source_product_id: product.product_id,
      source_business_id: product.business_id,
      source_business_name: product.business_name,
      customized: customizedPrice || undefined,
      meta: {
        type: "steel_catalogue",
        mode: m.kind,
        charge,
        lengthMm: L || null,
        widthMm: W || null,
        pieces: q,
        stockPieces: m.kind === "linear" ? tubesNeeded : m.kind === "plate" ? sheetsNeeded : null,
        weightKg: Number((weightKg || plateWeightKg).toFixed(2)),
      },
    });
  }

  return (
    <div>
      <button type="button" className="mb-2 text-xs text-ink-muted hover:text-ink" onClick={onCancel}>
        ← Back to results
      </button>

      {/* Catalogue details */}
      <div className="mb-3 rounded-lg border border-forest/20 bg-leaf/20 p-3">
        <p className="font-medium">{product.name}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
          <Store className="size-3.5" />
          Stocked by <span className="font-medium text-ink">{product.business_name}</span>
          {product.category ? <span>· {product.category}</span> : null}
        </p>
        <div className="mt-2 grid gap-x-4 gap-y-1 text-xs text-ink-muted sm:grid-cols-2">
          {m.kind === "linear" ? (
            <>
              <p>Standard {m.pieceLabel}: <span className="text-ink">{m.stockLengthM} m</span></p>
              <p>Price per {m.pieceLabel}: <span className="font-medium text-ink">{m.basePrimary > 0 ? money(m.basePrimary) : "not set"}</span></p>
              <p>Price per metre: <span className="text-ink">{m.basePrimary > 0 ? money(m.basePrimary / m.stockLengthM) : "—"}</span></p>
              {m.kgPerM ? <p>Weight: <span className="text-ink">{m.kgPerM} kg/m ({(m.kgPerM * m.stockLengthM).toFixed(1)} kg per {m.pieceLabel})</span></p> : null}
            </>
          ) : m.kind === "plate" ? (
            <>
              <p>Stock sheet: <span className="text-ink">{m.stockLmm} × {m.stockWmm} mm</span></p>
              <p>Price per sheet: <span className="font-medium text-ink">{m.basePrimary > 0 ? money(m.basePrimary) : "not set"}</span></p>
              <p>Price per m²: <span className="text-ink">{m.basePrimary > 0 && stockAreaM2 > 0 ? money(m.basePrimary / stockAreaM2) : "—"}</span></p>
              {m.kgPerSheet ? <p>Weight: <span className="text-ink">{m.kgPerSheet} kg per sheet</span></p> : null}
            </>
          ) : (
            <p>Price per {m.unit}: <span className="font-medium text-ink">{m.basePrimary > 0 ? money(m.basePrimary) : "not set"}</span></p>
          )}
          {product.specs?.standard ? <p>Standard: <span className="text-ink">{String(product.specs.standard)}</span></p> : null}
        </div>
      </div>

      {/* Customise */}
      <div className="grid gap-3 sm:grid-cols-3">
        {m.kind !== "unit" ? (
          <Field label="Length (mm)">
            <Input type="number" min={1} value={lengthMm} onChange={(e) => setLengthMm(e.target.value)} />
          </Field>
        ) : null}
        {m.kind === "plate" ? (
          <Field label="Width (mm)">
            <Input type="number" min={1} value={widthMm} onChange={(e) => setWidthMm(e.target.value)} />
          </Field>
        ) : null}
        <Field label={m.kind === "unit" ? `Quantity (${m.unit})` : "Quantity (pcs)"}>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        {m.kind !== "unit" ? (
          <Field label="Charge by">
            <Select value={charge} onChange={(e) => setCharge(e.target.value as "cut" | "stock")}>
              <option value="cut">{m.kind === "linear" ? "Cut length only" : "Cut area only"}</option>
              <option value="stock">{m.kind === "linear" ? `Full ${m.pieceLabel}s used` : "Full sheets used"}</option>
            </Select>
          </Field>
        ) : null}
        <Field label={`Price per ${m.kind === "unit" ? m.unit : m.pieceLabel} (KSh)`} hint={m.basePrimary > 0 ? "optional override" : "required — not in catalogue"}>
          <Input
            type="number"
            min={0}
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            placeholder={m.basePrimary > 0 ? String(Math.round(m.basePrimary * 100) / 100) : "Enter price"}
          />
        </Field>
      </div>

      {/* Live result */}
      <div className="mt-3 space-y-1 rounded-lg border border-line bg-canvas p-3 text-xs text-ink-muted">
        {m.kind === "linear" && L > 0 ? (
          <>
            <p>
              {q} × {L} mm = <span className="text-ink">{totalM.toFixed(2)} m</span>
              {weightKg ? <> · <span className="text-ink">{weightKg.toFixed(1)} kg</span></> : null}
            </p>
            <p>
              Stock needed: <span className="text-ink">{tubesNeeded} {m.pieceLabel}{tubesNeeded === 1 ? "" : "s"}</span>
              {L <= m.stockLmm ? ` (${Math.floor(m.stockLmm / L)} pc per ${m.pieceLabel})` : ""}
              {offcutM > 0 ? ` · offcut ${offcutM.toFixed(2)} m` : ""}
            </p>
          </>
        ) : null}
        {m.kind === "plate" && L > 0 && W > 0 ? (
          <>
            <p>
              {q} × {L}×{W} mm = <span className="text-ink">{totalAreaM2.toFixed(3)} m²</span>
              {plateWeightKg ? <> · <span className="text-ink">{plateWeightKg.toFixed(1)} kg</span></> : null}
            </p>
            <p>
              Stock needed: <span className="text-ink">{sheetsNeeded} sheet{sheetsNeeded === 1 ? "" : "s"}</span>
              {perSheet > 0 ? ` (${perSheet} pc per sheet)` : " (piece larger than a sheet)"}
            </p>
          </>
        ) : null}
        <p>
          Line total: <span className="text-sm font-medium text-ink">{money(amount)}</span>
          {amount > 0 ? <> · {lineQty} {lineUnit} @ {money(lineRate)}</> : null}
        </p>
      </div>

      <div className="mt-3 flex gap-2">
        <Button type="button" onClick={add} disabled={primary <= 0}>
          Add to quote
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Steel builder ──────────────────────────────────────────────────────
function inferSteelCategory(product?: MarketplaceProduct): SteelCategory | "" {
  if (!product) return "";
  const t = `${product.category} ${product.name}`.toLowerCase();
  if (/rhs|rectangular hollow/.test(t)) return "rhs";
  if (/shs|square hollow/.test(t)) return "shs";
  if (/chs|round hollow|black round pipe|galvanized pipe/.test(t)) return "chs";
  if (/ipe|i-beam|ibeam|universal beam|(^|\s)ub(\s|$)/.test(t)) return "ibeam";
  if (/channel|c-channel|u-channel|universal column|(^|\s)uc(\s|$)/.test(t)) return "channel";
  if (/unequal angle/.test(t)) return "angle";
  if (/angle/.test(t)) return "angle";
  if (/flat/.test(t)) return "flat_bar";
  if (/mesh|brc/.test(t)) return "mesh";
  if (/plate|sheet|chequer/.test(t)) return "plates";
  if (/tmt|round bar|reinforcement/.test(t)) return "shaft";
  return "";
}

function SteelBuilder({
  products,
  selectedProductId,
  onAdd,
}: {
  products: MarketplaceProduct[];
  selectedProductId?: string;
  onAdd: (item: QuoteLineItem) => void;
}) {
  // Declared ONCE, before any hook that reads it (fixes
  // "Cannot access 'selectedProduct' before initialization").
  const selectedProduct = selectedProductId
    ? products.find((p) => p.product_id === selectedProductId)
    : undefined;

  const [category, setCategory] = useState<SteelCategory | "">(() => inferSteelCategory(selectedProduct));
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

  const matchedBySelection = selectedProduct ? { product: selectedProduct, score: 999 } : null;
  const match =
    matchedBySelection ??
    (category && grade ? matchSteelProduct(products, category, grade, effectiveDims, dims.size) : null);
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
            : ["angle", "ibeam", "channel"].includes(category)
              ? `${dims.size || "catalogue section"} × ${effectiveDims.length}mm`
              : category === "flat_bar"
                ? `${effectiveDims.width}×${effectiveDims.thickness} × ${effectiveDims.length}mm`
                : category === "mesh"
                  ? `${dims.size || "mesh"} × ${effectiveDims.length}×${effectiveDims.width}mm`
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
        Enter the <span className="font-medium text-ink">finished size</span>. For standard sections such as RHS, SHS, angles, I-beams and channels, LifeBoost uses the catalogue <span className="font-medium text-ink">kg/m</span> reference when available, then applies the exact cut length and quantity.
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
                type={s.id === "size" ? "text" : "number"}
                min={s.id === "size" ? undefined : 0}
                step={s.id === "size" ? undefined : "any"}
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

      {category && category !== "plates" && category !== "cement" && category !== "mesh" && grade ? (
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

      {category && category !== "plates" && category !== "cement" && category !== "shaft" && category !== "mesh" ? (
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

function filterServices(
  services: MarketplaceProduct[],
  kind: "labour" | "transport" | "cutting" | "weld" | "paint",
): MarketplaceProduct[] {
  const nameRe =
    kind === "labour"
      ? /labour|labor|welder|fabricat|fitter|assembly|install|hour|man.?hour/i
      : kind === "transport"
        ? /transport|haul|deliver|truck|logistics|freight|km|tonne/i
        : kind === "cutting"
          ? /cut|laser|plasma|cnc|pierce|profile|nest/i
          : kind === "weld"
            ? /weld|mig|tig|arc|join/i
            : /paint|spray|coat|primer|finish|powder/i;
  const unitRe =
    kind === "labour"
      ? /hour|hr|day|job/i
      : kind === "transport"
        ? /km|tonne|trip|job/i
        : kind === "cutting"
          ? /m|mm|cm|pierce|job|m²|m2/i
          : kind === "weld"
            ? /m|mm|job/i
            : /m²|m2|job|litre|liter/i;

  const matched = services.filter((p) => {
    const hay = `${p.category} ${p.name}`;
    const unit = p.unit || "";
    return nameRe.test(hay) || unitRe.test(unit);
  });
  // If nothing matches keywords, show ALL services so the engineer can still pick a rate
  return matched.length > 0 ? matched : services;
}

function FabricationCostBuilder({
  products,
  services = [],
  onAdd,
}: {
  products: MarketplaceProduct[];
  /** Rates from Services tab (labour, transport, cutting, paint, weld) */
  services?: MarketplaceProduct[];
  onAdd: (item: QuoteLineItem) => void;
}) {
  const [kind, setKind] = useState<"labour" | "transport" | "wastage" | "cutting" | "weld" | "paint">(
    "labour",
  );
  const [serviceId, setServiceId] = useState("");
  const [professional, setProfessional] = useState("");
  const [hours, setHours] = useState("1");
  const [hourlyRate, setHourlyRate] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [loadTonnes, setLoadTonnes] = useState("1");
  const [distanceKm, setDistanceKm] = useState("");
  const [transportRate, setTransportRate] = useState("");
  const [wasteMode, setWasteMode] = useState<"linear" | "plate">("linear");
  const [standardLength, setStandardLength] = useState("");
  const [exactLength, setExactLength] = useState("");
  const [standardArea, setStandardArea] = useState("");
  const [exactArea, setExactArea] = useState("");
  const [wasteProductId, setWasteProductId] = useState("");
  const [wasteKgPerM, setWasteKgPerM] = useState("");
  const [wasteKgPerM2, setWasteKgPerM2] = useState("");
  const [wasteRate, setWasteRate] = useState("");
  const [wasteQty, setWasteQty] = useState("1");
  const [cutMethod, setCutMethod] = useState<"dxf" | "manual">("dxf");
  const [process, setProcess] = useState("Laser Cut");
  const [material, setMaterial] = useState("Mild Steel");
  const [thickness, setThickness] = useState("3");
  const [cutFile, setCutFile] = useState("");
  const [cutLenMm, setCutLenMm] = useState(0);
  const [pierces, setPierces] = useState(0);
  const [manualLenM, setManualLenM] = useState("");
  const [manualPierces, setManualPierces] = useState("0");
  const [cutQty, setCutQty] = useState("1");
  const [manualCutRate, setManualCutRate] = useState("");
  const [manualPierceRate, setManualPierceRate] = useState("0");
  const [manualCutCost, setManualCutCost] = useState("");
  const [weldLenM, setWeldLenM] = useState("");
  const [weldRate, setWeldRate] = useState("");
  const [paintArea, setPaintArea] = useState("");
  const [paintRate, setPaintRate] = useState("");

  const thicknessNum = Number(thickness) || 0;
  const labourServices = useMemo(() => filterServices(services, "labour"), [services]);
  const transportServices = useMemo(() => filterServices(services, "transport"), [services]);
  const cuttingServices = useMemo(() => filterServices(services, "cutting"), [services]);
  const weldServices = useMemo(() => filterServices(services, "weld"), [services]);
  const paintServices = useMemo(() => filterServices(services, "paint"), [services]);

  const selectedService = services.find((p) => p.product_id === serviceId);

  function applyServiceRate(id: string) {
    setServiceId(id);
    const s = services.find((p) => p.product_id === id);
    if (!s) return;
    const price = Number(s.selling_price) || 0;
    const unit = (s.unit || "").toLowerCase();
    if (kind === "labour") {
      setProfessional(s.name);
      setHourlyRate(String(price));
    } else if (kind === "transport") {
      setVehicle(s.name);
      setTransportRate(String(price));
    } else if (kind === "cutting") {
      if (unit.includes("pierce")) setManualPierceRate(String(price));
      else setManualCutRate(String(price));
    } else if (kind === "weld") {
      setWeldRate(String(price));
    } else if (kind === "paint") {
      setPaintRate(String(price));
    }
  }

  // Include Services tab rates so laser/plasma cut services match DXF pricing
  const ratePool = useMemo(() => {
    const byId = new Map<string, MarketplaceProduct>();
    for (const p of products) byId.set(p.product_id, p);
    for (const p of services) byId.set(p.product_id, p);
    return Array.from(byId.values());
  }, [products, services]);

  const matchedDxf = useMemo(
    () =>
      cutMethod === "dxf" && material && thicknessNum
        ? matchDxfRate(ratePool, material, thicknessNum, process)
        : null,
    [ratePool, cutMethod, material, thicknessNum, process],
  );
  const wasteProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          catalogMassKgPerM(p) &&
          /steel|rhs|shs|angle|beam|channel|pipe|bar|flat/i.test(`${p.category} ${p.name}`),
      ),
    [products],
  );
  const selectedWasteProduct = wasteProducts.find((p) => p.product_id === wasteProductId);

  async function handleDxf(file: File) {
    const parsed = parseDXF(await file.text());
    setCutFile(file.name);
    setCutLenMm(parsed.totalLen);
    setPierces(parsed.pierces);
    toast.success(`DXF: ${(parsed.totalLen / 1000).toFixed(2)} m cut · ${parsed.pierces} pierces`);
  }

  function addLabour() {
    const h = Number(hours) || 0;
    const rate = Number(hourlyRate) || 0;
    if (h <= 0 || rate <= 0) return toast.error("Enter hours and hourly rate (from Services or manual).");
    const name = professional.trim() || selectedService?.name || "Labour";
    onAdd({
      line_id: uid("QL"),
      description: `Labour — ${name}`,
      qty: h,
      unit: "hour",
      rate,
      amount: h * rate,
      source_product_id: selectedService?.product_id,
      source_business_id: selectedService?.business_id,
      source_business_name: selectedService?.business_name,
      meta: { type: "labour", professional: name, hours: h, hourlyRate: rate },
    });
    toast.success("Labour added.");
  }

  function addTransport() {
    const tonnes = Number(loadTonnes) || 0;
    const km = Number(distanceKm) || 0;
    const rate = Number(transportRate) || 0;
    if (km <= 0 || rate <= 0) return toast.error("Enter distance (km) and transport rate.");
    // If unit is per km only (no tonne), bill km × rate
    const unit = (selectedService?.unit || "").toLowerCase();
    const perKmOnly =
      unit === "km" || (unit.includes("/km") && !unit.includes("tonne"));
    const qty = perKmOnly ? km : tonnes > 0 ? tonnes * km : km;
    const amount = perKmOnly ? km * rate : tonnes > 0 ? tonnes * km * rate : km * rate;
    const label = vehicle.trim() || selectedService?.name || "Transport";
    onAdd({
      line_id: uid("QL"),
      description: `Transport — ${label}`,
      qty,
      unit: perKmOnly ? "km" : "tonne-km",
      rate,
      amount,
      source_product_id: selectedService?.product_id,
      source_business_id: selectedService?.business_id,
      source_business_name: selectedService?.business_name,
      meta: {
        type: "transport",
        vehicle: label,
        loadTonnes: tonnes,
        distanceKm: km,
        ratePerUnit: rate,
      },
    });
    toast.success("Transport added.");
  }

  function addWeld() {
    const len = Number(weldLenM) || 0;
    const rate = Number(weldRate) || 0;
    if (len <= 0 || rate <= 0) return toast.error("Enter weld length (m) and rate from Services or manual.");
    const name = selectedService?.name || "Welding";
    onAdd({
      line_id: uid("QL"),
      description: `Weld — ${name}`,
      qty: len,
      unit: "m",
      rate,
      amount: len * rate,
      source_product_id: selectedService?.product_id,
      source_business_id: selectedService?.business_id,
      source_business_name: selectedService?.business_name,
      meta: { type: "weld", lengthM: len, ratePerM: rate },
    });
    toast.success("Weld line added.");
  }

  function addPaint() {
    const area = Number(paintArea) || 0;
    const rate = Number(paintRate) || 0;
    if (area <= 0 || rate <= 0) return toast.error("Enter area (m²) and paint rate.");
    const name = selectedService?.name || "Paint";
    onAdd({
      line_id: uid("QL"),
      description: `Paint — ${name}`,
      qty: area,
      unit: "m²",
      rate,
      amount: area * rate,
      source_product_id: selectedService?.product_id,
      source_business_id: selectedService?.business_id,
      source_business_name: selectedService?.business_name,
      meta: { type: "paint", areaM2: area, ratePerM2: rate },
    });
    toast.success("Paint line added.");
  }

  function addWastage() {
    const qtyN = Math.max(1, Number(wasteQty) || 1);
    const rate = Number(wasteRate) || 0;
    let offcutKg = 0;
    let description = "";
    if (wasteMode === "linear") {
      const stock = Number(standardLength) || 0;
      const exact = Number(exactLength) || 0;
      const kgm = Number(wasteKgPerM) || catalogMassKgPerM(selectedWasteProduct) || 0;
      const effectiveWasteRate = rate > 0 ? rate : ((selectedWasteProduct?.unit || "kg").toLowerCase() === "kg" ? Number(selectedWasteProduct?.selling_price || 0) : 0);
      if (stock <= exact || kgm <= 0 || effectiveWasteRate <= 0) return toast.error("Select a catalogue material or enter kg/m, and enter price/kg.");
      offcutKg = (stock - exact) / 1000 * kgm * qtyN;
      description = `Wastage / offcut — ${selectedWasteProduct?.name || "linear steel"} · ${stock}mm stock − ${exact}mm required`;
    } else {
      const stock = Number(standardArea) || 0;
      const exact = Number(exactArea) || 0;
      const kgm2 = Number(wasteKgPerM2) || 0;
      if (stock <= exact || kgm2 <= 0 || rate <= 0) return toast.error("Enter standard area, exact area, kg/m² and price/kg.");
      offcutKg = (stock - exact) * kgm2 * qtyN;
      description = `Wastage / offcut — ${stock}m² stock − ${exact}m² required`;
    }
    onAdd({
      line_id: uid("QL"), description, qty: offcutKg, unit: "kg", rate: wasteMode === "linear" ? (rate > 0 ? rate : Number(selectedWasteProduct?.selling_price || 0)) : rate, amount: offcutKg * (wasteMode === "linear" ? (rate > 0 ? rate : Number(selectedWasteProduct?.selling_price || 0)) : rate),
      meta: { type: "wastage", mode: wasteMode, offcutKg, quantity: qtyN, sourceProductId: selectedWasteProduct?.product_id || null },
    });
    toast.success("Wastage added.");
  }

  function addCutting() {
    const qtyN = Math.max(1, Number(cutQty) || 1);
    const lenMm =
      cutMethod === "dxf"
        ? cutLenMm
        : (Number(manualLenM) || 0) * 1000;
    const pierceN = cutMethod === "dxf" ? pierces : Number(manualPierces) || 0;

    // Flat job cost override
    if (cutMethod === "manual" && Number(manualCutCost) > 0 && lenMm <= 0) {
      const amount = Number(manualCutCost) * qtyN;
      onAdd({
        line_id: uid("QL"),
        description: "Cutting — manual job cost",
        qty: qtyN,
        unit: "job",
        rate: Number(manualCutCost),
        amount,
        meta: { type: "cutting", method: "manual_job", quantity: qtyN },
      });
      toast.success("Manual cutting added.");
      return;
    }

    if (lenMm <= 0) {
      return toast.error(
        cutMethod === "dxf"
          ? "Upload a DXF file, or switch to Manual and enter cut length (m)."
          : "Enter cut length in metres (optional pierces).",
      );
    }

    const manualRate = Number(manualCutRate) || 0;
    const manualPierce = Number(manualPierceRate) || 0;
    const fromService = selectedService && (selectedService.unit || "").toLowerCase().includes("m");
    const ratePerM =
      manualRate ||
      (fromService ? Number(selectedService!.selling_price) : 0) ||
      (matchedDxf ? matchedDxf.ratePerM || 0 : 0);
    // matchDxfRate shape may differ — fallback via dxfLineTotal
    let cutCost = 0;
    let pierceCost = 0;
    if (manualRate > 0 || fromService) {
      cutCost = (lenMm / 1000) * (manualRate || Number(selectedService?.selling_price || 0));
      pierceCost = pierceN * manualPierce;
    } else if (matchedDxf) {
      const t = dxfLineTotal(lenMm, pierceN, matchedDxf, 1);
      cutCost = t.cutCost;
      pierceCost = t.pierceCost;
    }
    const amount = (cutCost + pierceCost) * qtyN;
    if (amount <= 0) {
      return toast.error(
        "No cutting rate. Pick a cutting service (Services tab), enter KSh/m, or match a catalogue cut rate.",
      );
    }
    onAdd({
      line_id: uid("QL"),
      description:
        cutMethod === "dxf"
          ? `DXF cutting${cutFile ? ` — ${cutFile}` : ""}`
          : `Cutting — ${(lenMm / 1000).toFixed(2)} m${pierceN ? ` · ${pierceN} pierces` : ""}`,
      qty: qtyN,
      unit: "job",
      rate: amount / qtyN,
      amount,
      source_product_id: selectedService?.product_id || matchedDxf?.product?.product_id,
      source_business_id: selectedService?.business_id || matchedDxf?.product?.business_id,
      source_business_name: selectedService?.business_name,
      meta: {
        type: "cutting",
        method: cutMethod,
        process,
        material,
        thickness: thicknessNum,
        cutLenM: lenMm / 1000,
        pierces: pierceN,
        rateSource: manualRate || selectedService ? "service/manual" : matchedDxf?.source || "unknown",
      },
    });
    toast.success("Cutting line added.");
  }

  return (
    <Card className="mb-4 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Fabrication costs</p>
          <p className="text-xs text-ink-muted">
            Rates from your <strong>Services</strong> tab
            {services.length
              ? ` (${services.length} rate${services.length === 1 ? "" : "s"} loaded)`
              : " — none found yet: add labour/cut/transport under Services"}
            . Engineer enters hours, km, or metres only.
          </p>
        </div>
        <Select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as typeof kind);
            setServiceId("");
          }}
        >
          <option value="labour">Labour (hours)</option>
          <option value="transport">Transport (km)</option>
          <option value="cutting">Cutting (DXF / m)</option>
          <option value="weld">Weld (m)</option>
          <option value="paint">Paint (m²)</option>
          <option value="wastage">Wastage / offcut</option>
        </Select>
      </div>

      {kind === "labour" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Service (from Services tab)" hint="optional — auto-fills rate">
            <Select value={serviceId} onChange={(e) => applyServiceRate(e.target.value)}>
              <option value="">— pick labour service —</option>
              {labourServices.map((s) => (
                <option key={s.product_id} value={s.product_id}>
                  {s.name} · {money(s.selling_price)}/{s.unit || "hour"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Professional / note">
            <Input
              value={professional}
              onChange={(e) => setProfessional(e.target.value)}
              placeholder="Welder / fabricator"
            />
          </Field>
          <Field label="Hours">
            <Input type="number" min={0} step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
          <Field label="Price / hour (KSh)">
            <Input type="number" min={0} value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
          </Field>
          <div className="sm:col-span-3">
            <Button type="button" variant="ghost" onClick={addLabour}>
              + Add labour
            </Button>
          </div>
        </div>
      ) : null}

      {kind === "transport" ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Service (from Services tab)">
            <Select value={serviceId} onChange={(e) => applyServiceRate(e.target.value)}>
              <option value="">— pick transport service —</option>
              {transportServices.map((s) => (
                <option key={s.product_id} value={s.product_id}>
                  {s.name} · {money(s.selling_price)}/{s.unit || "km"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vehicle / note">
            <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="5-ton truck" />
          </Field>
          <Field label="Load (tonnes)" hint="optional if rate is per km">
            <Input type="number" min={0} value={loadTonnes} onChange={(e) => setLoadTonnes(e.target.value)} />
          </Field>
          <Field label="Distance (km)">
            <Input type="number" min={0} value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
          </Field>
          <Field label="Rate (KSh)">
            <Input type="number" min={0} value={transportRate} onChange={(e) => setTransportRate(e.target.value)} />
          </Field>
          <div className="sm:col-span-4 text-xs text-ink-muted">
            Per km: km × rate. Per tonne-km: tonnes × km × rate.
          </div>
          <div className="sm:col-span-4">
            <Button type="button" variant="ghost" onClick={addTransport}>
              + Add transport
            </Button>
          </div>
        </div>
      ) : null}

      {kind === "weld" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Weld service">
            <Select value={serviceId} onChange={(e) => applyServiceRate(e.target.value)}>
              <option value="">— pick weld service —</option>
              {weldServices.map((s) => (
                <option key={s.product_id} value={s.product_id}>
                  {s.name} · {money(s.selling_price)}/{s.unit || "m"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Weld length (m)">
            <Input type="number" min={0} step="0.01" value={weldLenM} onChange={(e) => setWeldLenM(e.target.value)} />
          </Field>
          <Field label="Rate / m (KSh)">
            <Input type="number" min={0} value={weldRate} onChange={(e) => setWeldRate(e.target.value)} />
          </Field>
          <div className="sm:col-span-3">
            <Button type="button" variant="ghost" onClick={addWeld}>
              + Add weld
            </Button>
          </div>
        </div>
      ) : null}

      {kind === "paint" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Paint service">
            <Select value={serviceId} onChange={(e) => applyServiceRate(e.target.value)}>
              <option value="">— pick paint service —</option>
              {paintServices.map((s) => (
                <option key={s.product_id} value={s.product_id}>
                  {s.name} · {money(s.selling_price)}/{s.unit || "m²"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Area (m²)">
            <Input type="number" min={0} step="0.01" value={paintArea} onChange={(e) => setPaintArea(e.target.value)} />
          </Field>
          <Field label="Rate / m² (KSh)">
            <Input type="number" min={0} value={paintRate} onChange={(e) => setPaintRate(e.target.value)} />
          </Field>
          <div className="sm:col-span-3">
            <Button type="button" variant="ghost" onClick={addPaint}>
              + Add paint
            </Button>
          </div>
        </div>
      ) : null}

      {kind === "wastage" ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Wastage basis"><Select value={wasteMode} onChange={(e) => setWasteMode(e.target.value as typeof wasteMode)}><option value="linear">Linear stock</option><option value="plate">Plate area</option></Select></Field>
          {wasteMode === "linear" ? <><Field label="Catalogue material"><Select value={wasteProductId} onChange={(e) => { const id = e.target.value; setWasteProductId(id); const p = wasteProducts.find((x) => x.product_id === id); setWasteKgPerM(String(catalogMassKgPerM(p) || "")); if ((p?.unit || "kg").toLowerCase() === "kg") setWasteRate(String(p?.selling_price || "")); }}><option value="">Select material…</option>{wasteProducts.map((p) => <option key={p.product_id} value={p.product_id}>{p.name} · {catalogMassKgPerM(p)} kg/m</option>)}</Select></Field><Field label="Standard length (mm)"><Input type="number" min={0} value={standardLength} onChange={(e) => setStandardLength(e.target.value)} /></Field><Field label="Exact length (mm)"><Input type="number" min={0} value={exactLength} onChange={(e) => setExactLength(e.target.value)} /></Field><Field label="Catalogue kg/m"><Input type="number" min={0} value={wasteKgPerM} onChange={(e) => setWasteKgPerM(e.target.value)} /></Field></> : <><Field label="Standard area (m²)"><Input type="number" min={0} value={standardArea} onChange={(e) => setStandardArea(e.target.value)} /></Field><Field label="Exact area (m²)"><Input type="number" min={0} value={exactArea} onChange={(e) => setExactArea(e.target.value)} /></Field><Field label="Catalogue kg/m²"><Input type="number" min={0} value={wasteKgPerM2} onChange={(e) => setWasteKgPerM2(e.target.value)} /></Field></>}
          <Field label="Quantity"><Input type="number" min={1} value={wasteQty} onChange={(e) => setWasteQty(e.target.value)} /></Field>
          <Field label="Price / kg (KSh)"><Input type="number" min={0} value={wasteRate} onChange={(e) => setWasteRate(e.target.value)} /></Field>
          <div className="sm:col-span-4 text-xs text-ink-muted">Wastage is based on the actual stock size minus the exact required size, rather than an arbitrary percentage.</div>
          <div className="sm:col-span-4"><Button type="button" variant="ghost" onClick={addWastage}>+ Add wastage</Button></div>
        </div>
      ) : null}

      {kind === "cutting" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Cutting method">
              <Select
                value={cutMethod}
                onChange={(e) => setCutMethod(e.target.value as typeof cutMethod)}
              >
                <option value="dxf">DXF upload</option>
                <option value="manual">Manual length (m)</option>
              </Select>
            </Field>
            <Field label="Cutting service (Services tab)">
              <Select value={serviceId} onChange={(e) => applyServiceRate(e.target.value)}>
                <option value="">— pick cutting service —</option>
                {cuttingServices.map((s) => (
                  <option key={s.product_id} value={s.product_id}>
                    {s.name} · {money(s.selling_price)}/{s.unit || "m"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantity">
              <Input type="number" min={1} value={cutQty} onChange={(e) => setCutQty(e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Process">
              <Select value={process} onChange={(e) => setProcess(e.target.value)}>
                {DXF_PROCESSES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </Field>
            <Field label="Material">
              <Select value={material} onChange={(e) => setMaterial(e.target.value)}>
                {DXF_MATERIALS.slice(0, 4).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </Field>
            <Field label="Thickness (mm)">
              <Input type="number" min={0} value={thickness} onChange={(e) => setThickness(e.target.value)} />
            </Field>
          </div>
          {cutMethod === "dxf" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="DXF file">
                <Input
                  type="file"
                  accept=".dxf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleDxf(f);
                  }}
                />
              </Field>
              <div className="text-xs text-ink-muted pt-2">
                {cutFile
                  ? `${cutFile} · ${(cutLenMm / 1000).toFixed(2)} m · ${pierces} pierces`
                  : "Upload a DXF to auto-calc cut length and pierces."}
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Cut length (m)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={manualLenM}
                  onChange={(e) => setManualLenM(e.target.value)}
                  placeholder="e.g. 12.5"
                />
              </Field>
              <Field label="Pierces (optional)">
                <Input
                  type="number"
                  min={0}
                  value={manualPierces}
                  onChange={(e) => setManualPierces(e.target.value)}
                />
              </Field>
              <Field label="Or flat job cost (KSh)" hint="if set and no length, bills this only">
                <Input
                  type="number"
                  min={0}
                  value={manualCutCost}
                  onChange={(e) => setManualCutCost(e.target.value)}
                />
              </Field>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Rate / metre (KSh)" hint="from service or override">
              <Input
                type="number"
                min={0}
                value={manualCutRate}
                onChange={(e) => setManualCutRate(e.target.value)}
              />
            </Field>
            <Field label="Rate / pierce (KSh)">
              <Input
                type="number"
                min={0}
                value={manualPierceRate}
                onChange={(e) => setManualPierceRate(e.target.value)}
              />
            </Field>
          </div>
          <p className="text-xs text-ink-muted">
            {matchedDxf
              ? `Catalogue cutting rate matched: ${matchedDxf.note || "ok"}.`
              : "No catalogue cut rate — use a Service or enter KSh/m."}
          </p>
          <Button type="button" variant="ghost" onClick={addCutting}>
            + Add cutting
          </Button>
        </div>
      ) : null}
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