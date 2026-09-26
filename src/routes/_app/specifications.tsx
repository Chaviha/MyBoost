import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ListTree, Pencil, Trash2 } from "lucide-react";
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
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/specifications")({
  component: SpecificationsPage,
});

function SpecificationsPage() {
  const {
    selectedBusiness,
    businessCategories,
    businessSpecDefs,
    can,
    addSpecDefinition,
    updateSpecDefinition,
    deleteSpecDefinition,
    applyCatalogueTemplate,
    reorderSpecDefinition,
  } = useLife();
  const [open, setOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState("");

  if (!can("view_products")) {
    return <AccessDenied need="Product catalogues are for business owners." />;
  }
  if (!selectedBusiness) {
    return <EmptyState icon={ListTree} text="Add a business first." />;
  }

  const filtered = useMemo(() => {
    const list = businessSpecDefs.slice().sort((a, b) => a.sort_order - b.sort_order);
    if (!filterCategory) return list;
    return list.filter((s) => s.category_id === filterCategory);
  }, [businessSpecDefs, filterCategory]);

  const categoryName = (id: string) =>
    businessCategories.find((c) => c.category_id === id)?.name || "Category";

  return (
    <>
      <Toolbar
        title="Specifications"
        subtitle={`Table columns for this business. Use ← → to rearrange order after adding a field late for ${selectedBusiness.business_name}. Example: nominal bore 50 mm, OD 60.3 mm, 5.43 kg/m, 6.24 MPa.`}
        actionLabel="Add specification"
        onAction={() => {
          if (businessCategories.length === 0) {
            toast.message("Create a category first under Catalogue → Categories.");
            return;
          }
          setOpen(true);
        }}
      />

      {businessCategories.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select
            className="max-w-xs"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {businessCategories.map((c) => (
              <option key={c.category_id} value={c.category_id}>
                {c.name}
              </option>
            ))}
          </Select>
          {filterCategory &&
          !businessSpecDefs.some((s) => s.category_id === filterCategory) ? (
            <Select
              className="h-9 max-w-[14rem] text-sm"
              defaultValue=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                applyCatalogueTemplate(filterCategory, id);
                toast.success("Table columns applied to this category.");
                e.target.value = "";
              }}
            >
              <option value="">Apply table style…</option>
              <option value="steel_chs">CHS / pipe steel</option>
              <option value="steel_plate">Steel plate / sheet</option>
              <option value="steel_bar">Rebar / steel bar</option>
              <option value="cement_building">Cement & building</option>
              <option value="hardware_general">Hardware / tools</option>
              <option value="restaurant">Restaurant / kitchen</option>
              <option value="retail">Retail / FMCG</option>
              <option value="agriculture">Agriculture / farm</option>
              <option value="professional">Professional services</option>
            </Select>
          ) : null}
        </div>
      ) : null}

      {businessCategories.length === 0 ? (
        <EmptyState
          icon={ListTree}
          text="Create a category first, then define specifications for it."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ListTree}
          text="No specifications yet. Add fields such as Nominal bore (mm) or Mass (kg/m)."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((s) => (
            <Card key={s.spec_id} className="flex flex-col gap-2 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium">{s.label}</h3>
                  <p className="text-xs text-ink-muted">
                    key: <code className="text-ink">{s.key}</code>
                  </p>
                </div>
                <Badge tone="forest">{s.unit || "-"}</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Badge>{categoryName(s.category_id)}</Badge>
                <Badge tone="neutral">{s.data_type}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                <MoreActions actions={[
                  { label: "Move left", icon: <ChevronLeft className="size-4" />, onSelect: () => {
                    reorderSpecDefinition(s.spec_id, -1);
                  } },
                  { label: "Move right", icon: <ChevronRight className="size-4" />, onSelect: () => {
                    reorderSpecDefinition(s.spec_id, 1);
                  } },
                  { label: "Edit", icon: <Pencil className="size-4" />, onSelect: () => {
                    const label = window.prompt("Label", s.label);
                    if (label === null) return;
                    const unit = window.prompt("Unit", s.unit) ?? s.unit;
                    updateSpecDefinition(s.spec_id, { label: label.trim() || s.label, unit: unit.trim() });
                    toast.success("Specification updated.");
                  } },
                  { label: "Delete", destructive: true, icon: <Trash2 className="size-4" />, onSelect: () => {
                    if (!window.confirm(`Delete specification "${s.label}"?`)) return;
                    deleteSpecDefinition(s.spec_id);
                    toast.success("Specification deleted.");
                  } },
                ]} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add specification</DialogTitle>
          </DialogHeader>
          <SpecForm
            categories={businessCategories}
            defaultCategoryId={filterCategory || businessCategories[0]?.category_id || ""}
            onCancel={() => setOpen(false)}
            onSubmit={(form) => {
              addSpecDefinition(form);
              toast.success(`${form.label} added.`);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function SpecForm({
  categories,
  defaultCategoryId,
  onCancel,
  onSubmit,
}: {
  categories: { category_id: string; name: string }[];
  defaultCategoryId: string;
  onCancel: () => void;
  onSubmit: (form) => void;
}) {
  const [form, setForm] = useState({
    categoryId: defaultCategoryId,
    key: "",
    label: "",
    unit: "mm",
    dataType: "number" as "number" | "text",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.label.trim() || !form.categoryId) return;
        onSubmit(form);
      }}
    >
      <Field label="Category">
        <Select
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
        >
          {categories.map((c) => (
            <option key={c.category_id} value={c.category_id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Label">
        <Input
          required
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          placeholder="Nominal bore"
        />
      </Field>
      <Field label="Key" hint="Optional machine name; auto-generated from label if empty">
        <Input
          value={form.key}
          onChange={(e) => setForm({ ...form, key: e.target.value })}
          placeholder="nominal_bore"
        />
      </Field>
      <Field label="Unit">
        <Input
          value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
          placeholder="mm / kg/m / MPa"
        />
      </Field>
      <Field label="Data type">
        <Select
          value={form.dataType}
          onChange={(e) =>
            setForm({ ...form, dataType: e.target.value as "number" | "text" })
          }
        >
          <option value="number">Number</option>
          <option value="text">Text</option>
        </Select>
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Add specification</Button>
      </div>
    </form>
  );
}
