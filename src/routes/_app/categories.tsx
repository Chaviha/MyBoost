import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
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
import {
  CATALOGUE_TEMPLATES,
  templatesForBusinessType,
  type CatalogueTemplateId,
} from "@/lib/catalogue-templates";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/categories")({
  component: CategoriesPage,
});

function CategoriesPage() {
  const {
    selectedBusiness,
    businessCategories,
    businessSpecDefs,
    businessProducts,
    can,
    addProductCategory,
    updateProductCategory,
    deleteProductCategory,
    applyCatalogueTemplate,
  } = useLife();
  const [open, setOpen] = useState(false);

  if (!can("view_products")) {
    return <AccessDenied need="Product catalogues are for business owners." />;
  }
  if (!selectedBusiness) {
    return <EmptyState icon={Tags} text="Add a business first." />;
  }

  const suggested = templatesForBusinessType(selectedBusiness.business_type);

  return (
    <>
      <Toolbar
        title="Categories"
        subtitle={`Each category is a table style for ${selectedBusiness.business_name}. Steel, restaurant, retail and other trades use different columns.`}
        actionLabel="Add category"
        onAction={() => setOpen(true)}
      />

      <Card className="mb-4 p-4 text-sm text-ink-muted">
        <p className="font-medium text-ink">Table styles for this business type ({selectedBusiness.business_type})</p>
        <p className="mt-1">
          Suggested:{" "}
          {suggested
            .filter((t) => t.id !== "blank")
            .map((t) => t.name)
            .join(" · ") || "Blank + any industry template"}
        </p>
      </Card>

      {businessCategories.length === 0 ? (
        <EmptyState
          icon={Tags}
          text="No categories yet. Pick a table style (e.g. CHS pipe steel or Restaurant) so products store the right columns."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {businessCategories.map(
            (c) => {
              const specs = businessSpecDefs
                .filter((s) => s.category_id === c.category_id)
                .slice()
                .sort(
                  (a, b) =>
                    a.sort_order - b.sort_order
                );
              const products = businessProducts.filter(
                (p) => p.category_id === c.category_id
              );
              return (
                <Card key={c.category_id} className="flex flex-col gap-2 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-lg font-medium tracking-tight">{c.name}</h3>
                    <Badge>{c.unit_default || "unit"}</Badge>
                  </div>
                  {c.description ? (
                    <p className="text-sm text-ink-muted">{c.description}</p>
                  ) : null}
                  <p className="text-xs text-ink-muted">
                    {specs.length} column{specs.length === 1 ? "" : "s"} · {products.length} product
                    {products.length === 1 ? "" : "s"}
                  </p>
                  {specs.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border border-line">
                      <table className="w-full min-w-[12rem] text-left text-xs">
                        <thead className="bg-canvas text-ink-muted">
                          <tr>
                            {specs.map((s) => (
                              <th key={s.spec_id} className="px-2 py-1.5 font-medium">
                                {s.label}
                                {s.unit ? (
                                  <span className="font-normal opacity-70"> ({s.unit})</span>
                                ) : null}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="text-ink-faint">
                            {specs.map((s) => (
                              <td key={s.spec_id} className="px-2 py-1.5">
                                …
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-muted">No columns yet — apply a table style below.</p>
                  )}
                  <div className="mt-2 flex items-center justify-end gap-2">
                    {specs.length === 0 ? (
                      <Select
                        className="h-9 max-w-[11rem] text-sm"
                        defaultValue=""
                        onChange={(e) => {
                          const id = e.target.value as CatalogueTemplateId;
                          if (!id) return;
                          applyCatalogueTemplate(c.category_id, id);
                          toast.success("Table columns applied.");
                          e.target.value = "";
                        }}
                      >
                        <option value="">Apply table style…</option>
                        {CATALOGUE_TEMPLATES.filter((t) => t.id !== "blank").map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                    ) : null}
                    <MoreActions actions={[
                      { label: "Edit", icon: <Pencil className="size-4" />, onSelect: () => {
                        const name = window.prompt("Category name", c.name);
                        if (name === null) return;
                        const unit = window.prompt("Default unit", c.unit_default) ?? c.unit_default;
                        updateProductCategory(c.category_id, { name: name.trim() || c.name, unit_default: unit.trim() || c.unit_default });
                        toast.success("Category updated.");
                      } },
                      { label: "Delete", destructive: true, icon: <Trash2 className="size-4" />, onSelect: () => {
                        if (!window.confirm(`Delete category "${c.name}"? Columns are removed; products keep their data but lose this table link.`)) return;
                        deleteProductCategory(c.category_id);
                        toast.success("Category deleted.");
                      } },
                    ]} />
                  </div>
                </Card>
              );
            }
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add category · pick table style</DialogTitle>
          </DialogHeader>
          <CategoryForm
            businessType={selectedBusiness.business_type}
            onCancel={() => setOpen(false)}
            onSubmit={(form) => {
              const id = addProductCategory({
                name: form.name,
                description: form.description,
                unitDefault: form.unitDefault,
              });
              if (form.templateId && form.templateId !== "blank") {
                applyCatalogueTemplate(id, form.templateId);
                toast.success(`${form.name} created with ${form.templateId.replace(/_/g, " ")} columns.`);
              } else {
                toast.success(`${form.name} created.`);
              }
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoryForm({
  businessType,
  onCancel,
  onSubmit,
}: {
  businessType: string;
  onCancel: () => void;
  onSubmit: (form) => void;
}) {
  const options = templatesForBusinessType(businessType);
  const [form, setForm] = useState({
    name: "",
    description: "",
    unitDefault: "unit",
    templateId: (options.find((t) => t.id !== "blank")?.id || "blank") as CatalogueTemplateId,
  });
  const selected = CATALOGUE_TEMPLATES.find((t) => t.id === form.templateId);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        onSubmit({
          ...form,
          unitDefault: form.unitDefault || selected?.unit_default || "unit",
        });
      }}
    >
      <Field label="Category name">
        <Input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. CHS Mild Steel Pipe"
        />
      </Field>
      <Field label="Table style">
        <Select
          value={form.templateId}
          onChange={(e) => {
            const templateId = e.target.value as CatalogueTemplateId;
            const t = CATALOGUE_TEMPLATES.find((x) => x.id === templateId);
            setForm({
              ...form,
              templateId,
              unitDefault: t?.unit_default || form.unitDefault,
            });
          }}
        >
          {CATALOGUE_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.business_types.includes(businessType) ? " · recommended" : ""}
            </option>
          ))}
        </Select>
      </Field>
      {selected && selected.fields.length > 0 ? (
        <div className="mb-3 overflow-x-auto rounded-lg border border-line">
          <p className="bg-canvas px-2 py-1.5 text-xs text-ink-muted">{selected.description}</p>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-t border-line text-ink-muted">
                {selected.fields.map((f) => (
                  <th key={f.key} className="px-2 py-1.5 font-medium">
                    {f.label}
                    {f.unit ? ` (${f.unit})` : ""}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
      ) : (
        <p className="mb-3 text-xs text-ink-muted">Blank table — add columns later under Specifications.</p>
      )}
      <Field label="Description" hint="(optional)">
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <Field label="Default unit">
        <Input
          value={form.unitDefault}
          onChange={(e) => setForm({ ...form, unitDefault: e.target.value })}
        />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Add category</Button>
      </div>
    </form>
  );
}
