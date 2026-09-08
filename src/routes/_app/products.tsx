import { createFileRoute } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { useState } from "react";
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
import { money } from "@/lib/format";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/products")({
  component: ProductsPage,
});

function ProductsPage() {
  const { selectedBusiness, businessProducts, addProduct, can } = useLife();
  const [open, setOpen] = useState(false);

  if (!can("view_products")) {
    return <AccessDenied need="Product catalogues are for business owners." />;
  }
  if (!selectedBusiness) {
    return <EmptyState icon={Boxes} text="Add a business first." />;
  }

  return (
    <>
      <Toolbar
        title="Products"
        subtitle={`What ${selectedBusiness.business_name} sells. Charges on a customer tab can pick from this list.`}
        actionLabel="Add product"
        onAction={() => setOpen(true)}
      />
      {businessProducts.length === 0 ? (
        <EmptyState icon={Boxes} text="No products yet." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {businessProducts.map((p) => (
            <Card key={p.product_id} className="flex flex-col gap-2 p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg font-medium tracking-tight">{p.name}</h3>
                <Badge>{p.category || p.unit}</Badge>
              </div>
              <p className="font-display text-xl font-medium tabular-nums">
                {money(p.selling_price)}
                <span className="ml-1 text-sm font-sans font-normal text-ink-muted">
                  / {p.unit}
                </span>
              </p>
              <p className="text-xs text-ink-muted">
                Cost {money(p.cost_price)} · {p.stock} in stock
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-forest"
                  style={{ width: `${Math.min(100, (p.stock / 160) * 100)}%` }}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add product</DialogTitle>
          </DialogHeader>
          <ProductForm
            onCancel={() => setOpen(false)}
            onSubmit={(form) => {
              addProduct(form);
              toast.success(`${form.name} added.`);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProductForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (form: {
    name: string;
    category: string;
    unit: string;
    sellingPrice: string;
    costPrice: string;
    stock: string;
  }) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    category: "",
    unit: "unit",
    sellingPrice: "",
    costPrice: "",
    stock: "",
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.name || !form.sellingPrice) return;
        onSubmit(form);
      }}
    >
      <Field label="Product name">
        <Input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>
      <Field label="Category">
        <Input
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
      </Field>
      <Field label="Unit">
        <Input
          value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
          placeholder="bag / sheet / plate"
        />
      </Field>
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
        <Button type="submit">Add product</Button>
      </div>
    </form>
  );
}
