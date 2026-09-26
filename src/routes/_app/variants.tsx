import { createFileRoute } from "@tanstack/react-router";
import { Layers, Pencil, Trash2 } from "lucide-react";
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
import { money } from "@/lib/format";
import type { SpecValues } from "@/lib/types";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/variants")({
  component: VariantsPage,
});

function VariantsPage() {
  const {
    selectedBusiness,
    businessProducts,
    businessVariants,
    businessSpecDefs,
    can,
    addProductVariant,
    updateProductVariant,
    deleteProductVariant,
  } = useLife();
  const [open, setOpen] = useState(false);
  const [filterProduct, setFilterProduct] = useState("");

  if (!can("view_products")) {
    return <AccessDenied need="Product catalogues are for business owners." />;
  }
  if (!selectedBusiness) {
    return <EmptyState icon={Layers} text="Add a business first." />;
  }

  const activeProductId = filterProduct || businessProducts[0]?.product_id || "";

  const filtered = useMemo(() => {
    if (!activeProductId) return businessVariants;
    return businessVariants.filter((v) => v.product_id === activeProductId);
  }, [businessVariants, activeProductId]);

  const productName = (id: string) =>
    businessProducts.find((p) => p.product_id === id)?.name || "Product";

  const specsForProduct = (productId: string) => {
    const p = businessProducts.find(
      (x) => x.product_id === productId
    );
    if (!p?.category_id) return [];
    return businessSpecDefs
      .filter((s) => s.category_id === p.category_id)
      .slice()
      .sort(
        (a, b) => a.sort_order - b.sort_order
      );
  };

  const columnDefs = activeProductId ? specsForProduct(activeProductId) : [];

  return (
    <>
      <Toolbar
        title="Variants"
        subtitle={`Size / grade rows for ${selectedBusiness.business_name}. Columns follow the parent product’s category table style.`}
        actionLabel="Add variant"
        onAction={() => {
          if (businessProducts.length === 0) {
            toast.message("Add a product first under Catalogue → Products.");
            return;
          }
          setOpen(true);
        }}
      />

      {businessProducts.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select
            className="max-w-xs"
            value={activeProductId}
            onChange={(e) => setFilterProduct(e.target.value)}
          >
            {businessProducts.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Badge tone="neutral">{columnDefs.length} data columns</Badge>
        </div>
      ) : null}

      {businessProducts.length === 0 ? (
        <EmptyState icon={Layers} text="Add a product first, then create size variants under it." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-medium">{productName(activeProductId)}</p>
            <p className="text-xs text-ink-muted">
              Example steel row: NB 50 · OD 60.3 · 5.43 kg/m · 6.24 MPa
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-canvas text-xs tracking-wide text-ink-muted uppercase">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Variant</th>
                  <th className="px-3 py-2.5 font-medium">SKU</th>
                  {columnDefs.map(
                    (d) => (
                      <th key={d.spec_id} className="px-3 py-2.5 font-medium">
                        {d.label}
                        {d.unit ? (
                          <span className="font-normal normal-case opacity-70"> ({d.unit})</span>
                        ) : null}
                      </th>
                    )
                  )}
                  <th className="px-3 py-2.5 font-medium">Price</th>
                  <th className="px-3 py-2.5 font-medium">Stock</th>
                  <th className="px-3 py-2.5 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5 + columnDefs.length}
                      className="px-3 py-8 text-center text-ink-muted"
                    >
                      No variants for this product yet.
                    </td>
                  </tr>
                ) : (
                  filtered.map(
                    (v) => (
                      <tr key={v.variant_id} className="border-t border-line">
                        <td className="px-3 py-2.5 font-medium">{v.name}</td>
                        <td className="px-3 py-2.5 text-ink-muted">{v.sku || "-"}</td>
                        {columnDefs.map(
                          (d) => (
                            <td key={d.spec_id} className="px-3 py-2.5 tabular-nums">
                              {v.specs?.[d.key] ?? "-"}
                            </td>
                          )
                        )}
                        <td className="px-3 py-2.5 tabular-nums">{money(v.selling_price)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{v.stock}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            <MoreActions actions={[
                              { label: "Edit", icon: <Pencil className="size-4" />, onSelect: () => {
                                const name = window.prompt("Variant name", v.name);
                                if (name === null) return;
                                const price = window.prompt("Price", String(v.selling_price));
                                if (price === null) return;
                                const stock = window.prompt("Stock", String(v.stock));
                                if (stock === null) return;
                                updateProductVariant(v.variant_id, { name: name.trim() || v.name, selling_price: Number(price) || 0, stock: Number(stock) || 0 });
                                toast.success("Variant updated.");
                              } },
                              { label: "Delete", destructive: true, icon: <Trash2 className="size-4" />, onSelect: () => {
                                if (!window.confirm(`Delete variant "${v.name}"?`)) return;
                                deleteProductVariant(v.variant_id);
                                toast.success("Variant deleted.");
                              } },
                            ]} />
                          </div>
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add variant</DialogTitle>
          </DialogHeader>
          <VariantForm
            products={businessProducts}
            defaultProductId={activeProductId}
            specsForProduct={specsForProduct}
            onCancel={() => setOpen(false)}
            onSubmit={(form) => {
              addProductVariant(form);
              toast.success(`${form.name} added.`);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function VariantForm({
  products,
  defaultProductId,
  specsForProduct,
  onCancel,
  onSubmit,
}: {
  products: { product_id: string; name: string; category_id?: string }[];
  defaultProductId: string;
  specsForProduct: (productId: string) => {
    spec_id: string;
    key: string;
    label: string;
    unit: string;
    data_type: string;
  }[];
  onCancel: () => void;
  onSubmit: (form) => void;
}) {
  const [productId, setProductId] = useState(defaultProductId);
  const defs = specsForProduct(productId);
  const [form, setForm] = useState({
    name: "",
    sku: "",
    sellingPrice: "",
    costPrice: "",
    stock: "",
  });
  const [specs, setSpecs] = useState<SpecValues>({});

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.name.trim() || !productId || !form.sellingPrice) return;
        onSubmit({
          productId,
          name: form.name,
          sku: form.sku,
          sellingPrice: form.sellingPrice,
          costPrice: form.costPrice,
          stock: form.stock,
          specs,
        });
      }}
    >
      <Field label="Parent product">
        <Select
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            setSpecs({});
          }}
        >
          {products.map((p) => (
            <option key={p.product_id} value={p.product_id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Variant name">
        <Input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. CHS 50 NB"
        />
      </Field>
      <Field label="SKU" hint="(optional)">
        <Input
          value={form.sku}
          onChange={(e) => setForm({ ...form, sku: e.target.value })}
        />
      </Field>
      {defs.map((d) => (
        <Field key={d.spec_id} label={`${d.label}${d.unit ? ` (${d.unit})` : ""}`}>
          <Input
            type={d.data_type === "number" ? "number" : "text"}
            step="any"
            value={specs[d.key] ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              setSpecs({
                ...specs,
                [d.key]: d.data_type === "number" && raw !== "" ? Number(raw) : raw,
              });
            }}
            placeholder={
              d.key === "nominal_bore"
                ? "50"
                : d.key === "outside_dia"
                  ? "60.3"
                  : d.key === "mass_kg_m"
                    ? "5.43"
                    : d.key === "pressure_mpa"
                      ? "6.24"
                      : ""
            }
          />
        </Field>
      ))}
      <Field label="Selling price (KSh)">
        <Input
          required
          type="number"
          min={0}
          value={form.sellingPrice}
          onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
        />
      </Field>
      <Field label="Cost price (KSh)">
        <Input
          type="number"
          min={0}
          value={form.costPrice}
          onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
        />
      </Field>
      <Field label="Stock">
        <Input
          type="number"
          min={0}
          value={form.stock}
          onChange={(e) => setForm({ ...form, stock: e.target.value })}
        />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Add variant</Button>
      </div>
    </form>
  );
}
