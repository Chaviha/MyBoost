import { createFileRoute } from "@tanstack/react-router";
import { Boxes, Download, FileSpreadsheet, FileUp, ImagePlus, Package, Pencil, Share2, Table2, Trash2 } from "lucide-react";
import { MoreActions } from "@/components/more-actions";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access-denied";
import { Toolbar } from "@/components/app-shell";
import { CatalogueSubnav } from "@/components/catalogue-subnav";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { ListingCover } from "@/components/listing-cover";
import { ItemListBuilder } from "@/components/item-list-builder";
import { MediaManagerDialog } from "@/components/media-manager";
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
  downloadCatalogueHtml,
  printCataloguePdf,
  shareCatalogue,
} from "@/lib/catalogue-pdf";
import { money } from "@/lib/format";
import {
  downloadTextFile,
  parseProductSpreadsheet,
  productImportTemplateCsv,
  type ImportedProductRow,
} from "@/lib/product-import";
import type { SpecValues } from "@/lib/types";
import { SearchFilter } from "@/components/search-filter";
import { useLife } from "@/lib/store";

/** Prefer explicit cover, else first gallery image. */
function itemCoverUrl(p: { image_url?: string; gallery?: { url: string; media_type?: string }[] }): string {
  if (p.image_url) return p.image_url;
  const first = (p.gallery || []).find((m) => !m.media_type || m.media_type === "image");
  return first?.url || "";
}

export const Route = createFileRoute("/_app/products")({

  component: ProductsPage,
});

function ProductsPage() {
  return <CatalogueItemsPage itemKind="product" />;
}

/** Shared catalogue UI for stocked products and offered services. */
export function CatalogueItemsPage({ itemKind }: { itemKind: "product" | "service" }) {
  const isService = itemKind === "service";
  const {

    selectedBusiness,
    businessProducts,
    businessCategories,
    businessSpecDefs,
    businessVariants,
    addProduct,
    createItemList,
    importProducts,
    can,
    updateProduct,
    deleteProduct,
    uploadProductMedia,
    removeProductMedia,
    reorderProductMedia,
  } = useLife();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [familyFilter, setFamilyFilter] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [tableCategoryId, setTableCategoryId] = useState("");
  const [mediaForId, setMediaForId] = useState<string | null>(null);
  const [viewerForId, setViewerForId] = useState<string | null>(null);
  const mediaFor = businessProducts.find((p) => p.product_id === mediaForId) || null;
  const viewerFor = businessProducts.find((p) => p.product_id === viewerForId) || null;
  const viewerCover = viewerFor ? itemCoverUrl(viewerFor) : "";
  const [viewerPreviewUrl, setViewerPreviewUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const catalogueItems = businessProducts.filter((p) =>
    isService ? p.item_kind === "service" : (p.item_kind || "product") !== "service",
  );


  const activeCategoryId = tableCategoryId || businessCategories[0]?.category_id || "";

  const columnDefs = useMemo(() => {
    if (!activeCategoryId) return [];
    return businessSpecDefs
      .filter((s) => s.category_id === activeCategoryId)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [businessSpecDefs, activeCategoryId]);

  const tableRows = useMemo(() => {
    const inCategory = activeCategoryId
      ? catalogueItems.filter((p) => p.category_id === activeCategoryId)
      : catalogueItems;
    const filtered = familyFilter ? inCategory.filter((p) => (p.family || "") === familyFilter) : inCategory;
    // Keep each family's rows together (stable sort, so entry order is kept within a family).
    return filtered.slice().sort((a, b) => (a.family || "\uffff").localeCompare(b.family || "\uffff"));
  }, [catalogueItems, activeCategoryId, familyFilter]);

  const categoryFamilies = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalogueItems) {
      if (p.family && (!activeCategoryId || p.category_id === activeCategoryId)) set.add(p.family);
    }
    return [...set].sort();
  }, [catalogueItems, activeCategoryId]);

  const specsByCategory = useMemo(() => {
    const map = new Map<string, typeof businessSpecDefs>();
    for (const s of businessSpecDefs) {
      const list = map.get(s.category_id) || [];
      list.push(s);
      map.set(s.category_id, list);
    }
    for (const [k, list] of map) {
      map.set(
        k,
        list.slice().sort((a, b) => a.sort_order - b.sort_order),
      );
    }
    return map;
  }, [businessSpecDefs]);

  if (!can("view_products")) {
    return <AccessDenied need="Product catalogues are for business owners." />;
  }
  if (!selectedBusiness) {
    return <EmptyState icon={Boxes} text="Add a business first." />;
  }

  const categoryLabel =
    businessCategories.find((c) => c.category_id === activeCategoryId)?.name || "All products";

  const showTable = Boolean(activeCategoryId);

  return (
    <>
      <Toolbar
        title={isService ? "Catalogue · Items · Service" : "Catalogue · Items · Product"}
        subtitle={
          isService
            ? `Service items for ${selectedBusiness.business_name}: specifications + pricing (no stock). Labour, cutting, transport, paint…`
            : `Product items for ${selectedBusiness.business_name}: specifications, optional options, pricing, optional stock.`
        }
        actionLabel={isService ? "Add service" : "Add product"}
        onAction={() => setChooserOpen(true)}
      />
      <CatalogueSubnav />
      <SearchFilter onSearch={setSearchQuery} placeholder="Search products and services…" />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
          <FileUp className="size-3.5" /> Import Excel / CSV
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            try {
              printCataloguePdf(
                {
                  business_name: selectedBusiness.business_name,
                  business_type: selectedBusiness.business_type,
                  phone: selectedBusiness.phone,
                  email: selectedBusiness.email,
                  region: selectedBusiness.region,
                },
                catalogueItems.map((p) => ({
                  name: p.name,
                  category: p.category || "General",
                  sku: p.sku,
                  unit: p.unit,
                  selling_price: p.selling_price,
                  stock: p.stock,
                  description: p.description,
                  specs: p.specs,
                })),
              );
              toast.message("Print dialog opened — choose Save as PDF to download.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Unable to open PDF.");
            }
          }}
          disabled={catalogueItems.length === 0}
        >
          <Download className="size-3.5" /> Download PDF
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={async () => {
            try {
              const mode = await shareCatalogue(
                {
                  business_name: selectedBusiness.business_name,
                  business_type: selectedBusiness.business_type,
                  phone: selectedBusiness.phone,
                  email: selectedBusiness.email,
                  region: selectedBusiness.region,
                },
                catalogueItems.map((p) => ({
                  name: p.name,
                  category: p.category || "General",
                  sku: p.sku,
                  unit: p.unit,
                  selling_price: p.selling_price,
                  stock: p.stock,
                  description: p.description,
                  specs: p.specs,
                })),
              );
              toast.success(mode === "shared" ? "Catalogue shared." : "Catalogue file downloaded.");
            } catch (e) {
              if ((e as Error)?.name === "AbortError") return;
              toast.error(e instanceof Error ? e.message : "Unable to share.");
            }
          }}
          disabled={catalogueItems.length === 0}
        >
          <Share2 className="size-3.5" /> Share catalogue
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            downloadCatalogueHtml(
              {
                business_name: selectedBusiness.business_name,
                business_type: selectedBusiness.business_type,
                phone: selectedBusiness.phone,
                email: selectedBusiness.email,
                region: selectedBusiness.region,
              },
              catalogueItems.map((p) => ({
                name: p.name,
                category: p.category || "General",
                sku: p.sku,
                unit: p.unit,
                selling_price: p.selling_price,
                stock: p.stock,
                description: p.description,
                specs: p.specs,
              })),
            );
            toast.success("Catalogue HTML downloaded.");
          }}
          disabled={catalogueItems.length === 0}
        >
          <FileSpreadsheet className="size-3.5" /> Save HTML
        </Button>
      </div>

      {businessCategories.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select
            className="max-w-xs"
            value={activeCategoryId}
            onChange={(e) => {
              setTableCategoryId(e.target.value);
              setFamilyFilter("");
            }}
          >
            {businessCategories.map((c) => (
              <option key={c.category_id} value={c.category_id}>
                {c.name}
              </option>
            ))}
            <option value="">All (card view)</option>
          </Select>
          {categoryFamilies.length > 0 ? (
            <Select
              className="max-w-xs"
              value={familyFilter}
              onChange={(e) => setFamilyFilter(e.target.value)}
            >
              <option value="">All families</option>
              {categoryFamilies.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          ) : null}
          <Badge tone="neutral">{columnDefs.length} data columns</Badge>
        </div>
      ) : null}

      {catalogueItems.length === 0 ? (
        <EmptyState icon={Boxes} text={isService ? "No services yet." : "No products yet."} />
      ) : showTable ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-medium">{categoryLabel}</p>
            <p className="text-xs text-ink-muted">
              Each row is a product in this table style. Use Variants for multiple sizes under one
              parent.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-canvas text-xs tracking-wide text-ink-muted uppercase">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Design</th>
                  <th className="px-3 py-2.5 font-medium">Family</th>
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">SKU</th>
                  {columnDefs.map((d) => (
                    <th key={d.spec_id} className="px-3 py-2.5 font-medium">
                      {d.label}
                      {d.unit ? (
                        <span className="font-normal normal-case opacity-70"> ({d.unit})</span>
                      ) : null}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 font-medium">Price</th>
                  <th className="px-3 py-2.5 font-medium">Stock</th>
                  <th className="px-3 py-2.5 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7 + columnDefs.length}
                      className="px-3 py-8 text-center text-ink-muted"
                    >
                      
                    </td>
                  </tr>
                ) : (
                  tableRows.filter((p) => `${p.name} ${p.sku ?? ""} ${p.family ?? ""}`.toLowerCase().includes(searchQuery.toLowerCase())).map((p) => {
                    const variantCount = businessVariants.filter(
                      (v) => v.product_id === p.product_id,
                    ).length;
                    return (
                      <tr key={p.product_id} className="border-t border-line">
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            className="block size-12 overflow-hidden rounded-md border border-line bg-canvas"
                            onClick={() => { setViewerForId(p.product_id); setViewerPreviewUrl(itemCoverUrl(p)); }}
                            title="View main image"
                          >
                            {itemCoverUrl(p) ? (
                              <img src={itemCoverUrl(p)} alt="" className="size-full object-cover" />
                            ) : (
                              <span className="flex size-full items-center justify-center text-ink-faint">
                                <ImagePlus className="size-4" />
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-ink-muted">{p.family || "-"}</td>
                        <td className="px-3 py-2.5 font-medium">
                          {p.name}
                          {variantCount > 0 ? (
                            <span className="ml-1 text-xs font-normal text-ink-muted">
                              ({variantCount} var.)
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-ink-muted">{p.sku || "-"}</td>
                        {columnDefs.map((d) => (
                          <td key={d.spec_id} className="px-3 py-2.5 tabular-nums">
                            {p.specs?.[d.key] ?? "-"}
                          </td>
                        ))}
                        <td className="px-3 py-2.5 tabular-nums">
                          {money(p.selling_price)}
                          <span className="text-xs text-ink-muted"> / {p.unit}</span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">{p.stock}</td>
                        <td className="px-3 py-2.5 text-right">
                          <ProductMoreMenu
                            onEdit={() => {
                              const name = window.prompt("Product name", p.name);
                              if (name === null) return;
                              const priceText = window.prompt(
                                "Selling price",
                                String(p.selling_price),
                              );
                              if (priceText === null) return;
                              const stockText = window.prompt("Stock", String(p.stock));
                              if (stockText === null) return;
                              updateProduct(p.product_id, {
                                name: name.trim() || p.name,
                                selling_price: Number(priceText) || 0,
                                stock: Number(stockText) || 0,
                              });
                              toast.success("Product updated.");
                            }}
                            onImages={() => setMediaForId(p.product_id)}
                            onDelete={() => {
                              if (window.confirm(`Delete ${p.name}?`)) {
                                deleteProduct(p.product_id);
                                toast.success("Product deleted.");
                              }
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {catalogueItems.map((p) => {
            const category = businessCategories.find((c) => c.category_id === p.category_id);
            const defs = p.category_id ? specsByCategory.get(p.category_id) || [] : [];
            const visibleSpecs = defs
              .filter((d) => p.specs?.[d.key] !== undefined && p.specs?.[d.key] !== "")
              .slice(0, 6);
            const variantCount = businessVariants.filter((v) => v.product_id === p.product_id).length;

            return (
              <Card key={p.product_id} className="group overflow-hidden p-0">
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => {
                    setViewerForId(p.product_id);
                    setViewerPreviewUrl(itemCoverUrl(p));
                  }}
                  title="View main image"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-canvas">
                    {itemCoverUrl(p) ? (
                      <img
                        src={itemCoverUrl(p)}
                        alt={p.name}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-ink-faint">
                        <ImagePlus className="size-10" />
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/55 to-transparent p-4 pt-12">
                      <p className="text-xs font-medium uppercase tracking-wide text-white/80">
                        {category?.name || p.category || (isService ? "Service" : "Product")}
                      </p>
                    </div>
                    {itemCoverUrl(p) ? (
                      <span className="absolute right-2 top-2 rounded bg-ink/70 px-2 py-0.5 text-[10px] text-white">
                        View
                      </span>
                    ) : null}
                  </div>
                </button>

                <div className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-xl font-medium tracking-tight">{p.name}</h3>
                      {p.family ? <p className="mt-0.5 text-xs text-ink-muted">Family: {p.family}</p> : null}
                      {p.sku ? <p className="mt-0.5 text-xs text-ink-muted">SKU: {p.sku}</p> : null}
                    </div>
                    {variantCount > 0 ? <Badge tone="neutral">{variantCount} variants</Badge> : null}
                  </div>

                  {p.description ? (
                    <p className="line-clamp-2 text-sm text-ink-muted">{p.description}</p>
                  ) : null}

                  {visibleSpecs.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {visibleSpecs.map((d) => (
                        <div key={d.spec_id} className="rounded-lg border border-line bg-canvas px-3 py-2">
                          <p className="text-[11px] text-ink-muted">{d.label}</p>
                          <p className="mt-0.5 text-sm font-medium tabular-nums">
                            {String(p.specs?.[d.key])}{d.unit ? ` ${d.unit}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex items-end justify-between gap-3 border-t border-line pt-3">
                    <div>
                      <p className="font-display text-2xl font-medium tabular-nums">
                        {money(p.selling_price)}
                        <span className="ml-1 text-sm font-sans font-normal text-ink-muted">/ {p.unit}</span>
                      </p>
                      <p className="text-xs text-ink-muted">{p.stock} in stock</p>
                    </div>
                    <ProductMoreMenu
                      onEdit={() => {
                        const name = window.prompt("Product name", p.name);
                        if (name === null) return;
                        const priceText = window.prompt(
                          "Selling price",
                          String(p.selling_price),
                        );
                        if (priceText === null) return;
                        const stockText = window.prompt("Stock", String(p.stock));
                        if (stockText === null) return;
                        updateProduct(p.product_id, {
                          name: name.trim() || p.name,
                          selling_price: Number(priceText) || 0,
                          stock: Number(stockText) || 0,
                        });
                        toast.success("Product updated.");
                      }}
                      onImages={() => setMediaForId(p.product_id)}
                      onDelete={() => {
                        if (window.confirm(`Delete ${p.name}?`)) {
                          deleteProduct(p.product_id);
                          toast.success("Product deleted.");
                        }
                      }}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={chooserOpen} onOpenChange={(v) => !v && setChooserOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isService ? "Add service" : "Add product"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <button
              type="button"
              className="flex items-start gap-3 rounded-lg border border-line bg-canvas p-4 text-left transition hover:border-forest/50 hover:bg-paper"
              onClick={() => {
                setChooserOpen(false);
                setOpen(true);
              }}
            >
              <Package className="mt-0.5 size-5 shrink-0 text-forest" />
              <span>
                <span className="block font-medium">Add item</span>
                <span className="block text-sm text-ink-muted">
                  One {isService ? "service" : "product"} with its details, specifications and price.
                </span>
              </span>
            </button>
            <button
              type="button"
              className="flex items-start gap-3 rounded-lg border border-line bg-canvas p-4 text-left transition hover:border-forest/50 hover:bg-paper"
              onClick={() => {
                setChooserOpen(false);
                setListOpen(true);
              }}
            >
              <Table2 className="mt-0.5 size-5 shrink-0 text-forest" />
              <span>
                <span className="block font-medium">Add item list</span>
                <span className="block text-sm text-ink-muted">
                  Build a table of many items at once: pick a category, group them by family and fill in specification columns.
                </span>
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={listOpen} onOpenChange={(v) => !v && setListOpen(false)}>
        <DialogContent className="w-[min(calc(100%-2rem),76rem)] max-h-[92dvh]">
          <DialogHeader>
            <DialogTitle>{isService ? "Add service list" : "Add item list"}</DialogTitle>
          </DialogHeader>
          {listOpen ? (
            <ItemListBuilder
              categories={businessCategories}
              specDefs={businessSpecDefs}
              existingFamilies={catalogueItems
                .filter((p) => p.family)
                .map((p) => ({ category_id: p.category_id || "", family: p.family as string }))}
              itemKind={itemKind}
              defaultCategoryId={activeCategoryId}
              onCancel={() => setListOpen(false)}
              onSubmit={(form) => {
                const n = createItemList({ ...form, itemKind });
                if (!n) return;
                toast.success(`${n} ${isService ? "service" : "item"}${n === 1 ? "" : "s"} added.`);
                setTableCategoryId("");
                setFamilyFilter("");
                setListOpen(false);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isService ? "Add service" : "Add product"}</DialogTitle>
          </DialogHeader>
          <ProductForm
            categories={businessCategories}
            specsByCategory={specsByCategory}
            defaultCategoryId={activeCategoryId}
            itemKind={itemKind}
            onCancel={() => setOpen(false)}
            onSubmit={(form) => {
              addProduct({ ...form, itemKind });
              toast.success(`${form.name} added.`);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={(v) => !v && setImportOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isService ? "Import services (Excel / CSV)" : "Import products (Excel / CSV)"}</DialogTitle>
          </DialogHeader>
          <ImportProductsForm
            categories={businessCategories}
            defaultKind={itemKind}
            onCancel={() => setImportOpen(false)}
            onImport={(rows, categoryId) => {
              const cat = businessCategories.find((c) => c.category_id === categoryId);
              const mapped = rows.map((r) => ({
                name: r.name,
                category: r.category || cat?.name || "",
                categoryId: categoryId || "",
                unit: r.unit || cat?.unit_default || (itemKind === "service" ? "job" : "unit"),
                sellingPrice: r.selling_price,
                costPrice: r.cost_price,
                stock: r.stock,
                sku: r.sku,
                description: r.description,
                specs: r.specs,
                itemKind: r.item_kind || itemKind,
              }));
              const n = importProducts(mapped, itemKind);
              toast.success(`Imported ${n} ${itemKind}${n === 1 ? "" : "s"}.`);
              setImportOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

            {/* Full-size main image viewer */}
      <Dialog open={Boolean(viewerFor)} onOpenChange={(v) => !v && setViewerForId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewerFor?.name || "Image"}</DialogTitle>
          </DialogHeader>
          {(viewerPreviewUrl || viewerCover) ? (
            <div className="overflow-hidden rounded-lg border border-line bg-canvas">
              <img
                src={viewerPreviewUrl || viewerCover}
                alt={viewerFor?.name || ""}
                className="mx-auto max-h-[70vh] w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line py-16 text-ink-muted">
              <ImagePlus className="size-10" />
              <p className="text-sm">No main image yet.</p>
            </div>
          )}
          {(viewerFor?.gallery?.length || 0) > 1 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {(viewerFor?.gallery || [])
                .filter((m) => !m.media_type || m.media_type === "image")
                .map((m) => (
                  <button
                    key={m.media_id}
                    type="button"
                    className={`size-16 shrink-0 overflow-hidden rounded-md border ${
                      m.url === (viewerPreviewUrl || viewerCover) ? "border-forest ring-2 ring-forest/30" : "border-line"
                    }`}
                    onClick={() => setViewerPreviewUrl(m.url)}
                    title={m.name}
                  >
                    <img src={m.url} alt="" className="size-full object-cover" />
                  </button>
                ))}
            </div>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setViewerForId(null)}>
              Close
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (viewerFor) {
                  setMediaForId(viewerFor.product_id);
                  setViewerForId(null);
                }
              }}
            >
              Manage images
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MediaManagerDialog
        open={Boolean(mediaFor)}
        onClose={() => setMediaForId(null)}
        title={mediaFor ? `${mediaFor.name}: images` : (isService ? "Service images" : "Product images")}
        gallery={mediaFor?.gallery || []}
        coverUrl={mediaFor?.image_url}
        onUpload={async (files) => {
          if (!mediaFor) return;
          await uploadProductMedia(mediaFor.product_id, files);
        }}
        onRemove={async (mediaId) => {
          if (!mediaFor) return;
          await removeProductMedia(mediaFor.product_id, mediaId);
        }}
        onReorder={async (order) => {
          if (!mediaFor) return;
          await reorderProductMedia(mediaFor.product_id, order);
        }}
      />
    </>
  );
}

function ProductMoreMenu({
  onEdit,
  onImages,
  onDelete,
}: {
  onEdit: () => void;
  onImages: () => void;
  onDelete: () => void;
}) {
  // Radix dropdown: closes on outside click, Escape, and after choosing an action.
  return (
    <MoreActions
      label="More product actions"
      actions={[
        { label: "Edit product", icon: <Pencil className="size-3.5" />, onSelect: onEdit },
        { label: "Manage images", icon: <ImagePlus className="size-3.5" />, onSelect: onImages },
        { label: "Delete product", icon: <Trash2 className="size-3.5" />, destructive: true, onSelect: onDelete },
      ]}
    />
  );
}

function ProductForm({
  categories,
  specsByCategory,
  defaultCategoryId,
  itemKind = "product",
  onCancel,
  onSubmit,
}: {
  categories: { category_id: string; name: string; unit_default: string }[];
  specsByCategory: Map<
    string,
    { spec_id: string; key: string; label: string; unit: string; data_type: string }[]
  >;
  defaultCategoryId: string;
  itemKind?: "product" | "service";
  onCancel: () => void;
  onSubmit: (form: {
    name: string;
    category: string;
    categoryId: string;
    unit: string;
    sellingPrice: string;
    costPrice: string;
    stock: string;
    sku: string;
    description: string;
    specs: SpecValues;
    family: string;
  }) => void;
}) {
  const [categoryId, setCategoryId] = useState(defaultCategoryId || "");
  const [form, setForm] = useState({
    name: "",
    category: "",
    unit: itemKind === "service" ? "job" : "unit",
    sellingPrice: "",
    costPrice: "",
    stock: "",
    sku: "",
    description: "",
    family: "",
  });
  const [specs, setSpecs] = useState<SpecValues>({});
  const defs = categoryId ? specsByCategory.get(categoryId) || [] : [];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.name || !form.sellingPrice) return;
        const cat = categories.find((c) => c.category_id === categoryId);
        onSubmit({
          ...form,
          category: cat?.name || form.category,
          categoryId,
          specs,
        });
      }}
    >
      <Field label={itemKind === "service" ? "Service name" : "Product name"}>
        <Input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Mild steel CHS pipe"
        />
      </Field>
      <Field label="Category (table style)">
        {categories.length > 0 ? (
          <Select
            value={categoryId}
            onChange={(e) => {
              const id = e.target.value;
              setCategoryId(id);
              setSpecs({});
              const cat = categories.find((c) => c.category_id === id);
              if (cat) {
                setForm((f) => ({
                  ...f,
                  category: cat.name,
                  unit: cat.unit_default || f.unit,
                }));
              }
            }}
          >
            <option value="">— Free-text / none —</option>
            {categories.map((c) => (
              <option key={c.category_id} value={c.category_id}>
                {c.name}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="Create a category with a table style first"
          />
        )}
      </Field>
      <Field label="Family" hint="(optional, groups sizes/grades in the table)">
        <Input
          value={form.family}
          onChange={(e) => setForm({ ...form, family: e.target.value })}
          placeholder="e.g. CHS pipe"
        />
      </Field>
      <Field label="SKU" hint="(optional)">
        <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
      </Field>
      <Field label="Unit">
        <Input
          value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
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
      {itemKind === "product" ? (
        <Field label="Stock">
          <Input
            type="number"
            min={0}
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
          />
        </Field>
      ) : (
        <p className="mb-3 text-xs text-ink-muted">Services do not track stock quantity.</p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}

function ImportProductsForm({
  categories,
  defaultKind = "product",
  onCancel,
  onImport,
}: {
  categories: { category_id: string; name: string; unit_default: string }[];
  defaultKind?: "product" | "service";
  onCancel: () => void;
  onImport: (rows: ImportedProductRow[], categoryId: string) => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.category_id || "");
  const [preview, setPreview] = useState<ImportedProductRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [issues, setIssues] = useState<{ row: number; field?: string; message: string; severity: string }[]>([]);
  const [stats, setStats] = useState<{ total_data_rows: number; valid: number; rejected: number; warnings: number } | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setFileName(file.name);
    try {
      const result = await parseProductSpreadsheet(file, defaultKind);
      setPreview(result.rows);
      setErrors(result.errors);
      setIssues(result.issues || []);
      setStats(result.stats || null);
      if (result.rows.length) {
        toast.message(
          `${result.stats.valid} valid row${result.stats.valid === 1 ? "" : "s"}` +
            (result.stats.rejected ? ` · ${result.stats.rejected} rejected` : "") +
            (result.stats.warnings ? ` · ${result.stats.warnings} warning(s)` : ""),
        );
      } else if (result.errors.length) {
        toast.error(result.errors[0]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read file.");
      setPreview([]);
      setIssues([]);
      setStats(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        Upload a <span className="font-medium text-ink">.csv</span> or{" "}
        <span className="font-medium text-ink">.xlsx</span> for{" "}
        <span className="font-medium text-ink">{defaultKind}s</span>. Required:{" "}
        <span className="font-medium text-ink">name</span>. Optional: category, sku, unit,
        selling_price, cost_price, stock, description, type (product/service). Extra columns → specs.
        Invalid rows are blocked; duplicate SKUs and bad numbers are reported.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            downloadTextFile(
              `lifeboost-${defaultKind}s-template.csv`,
              productImportTemplateCsv(defaultKind),
            )
          }
        >
          <Download className="size-3.5" /> Download template
        </Button>
      </div>
      <Field label="Default category (optional)">
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">— From file / none —</option>
          {categories.map((c) => (
            <option key={c.category_id} value={c.category_id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="File">
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-ink/20 px-3 py-3 text-sm text-ink-muted hover:border-forest">
          <FileUp className="size-4" />
          {busy ? "Validating…" : fileName || "Choose .csv or .xlsx"}
          <input
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] || null)}
          />
        </label>
      </Field>
      {stats ? (
        <p className="text-xs text-ink-muted">
          {stats.total_data_rows} data row{stats.total_data_rows === 1 ? "" : "s"} ·{" "}
          <span className="text-ink">{stats.valid} valid</span>
          {stats.rejected ? ` · ${stats.rejected} rejected` : ""}
          {stats.warnings ? ` · ${stats.warnings} warning(s)` : ""}
        </p>
      ) : null}
      {errors.length > 0 ? (
        <ul className="text-xs text-red-600 space-y-1">
          {errors.slice(0, 6).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      {issues.length > 0 ? (
        <div className="max-h-28 overflow-auto rounded-md border border-line bg-canvas p-2 text-xs">
          {issues.slice(0, 30).map((iss, i) => (
            <p
              key={`${iss.row}-${i}`}
              className={iss.severity === "error" ? "text-red-600" : "text-amber-700"}
            >
              Row {iss.row}
              {iss.field ? ` · ${iss.field}` : ""}: {iss.message}
            </p>
          ))}
          {issues.length > 30 ? (
            <p className="text-ink-muted">…and {issues.length - 30} more</p>
          ) : null}
        </div>
      ) : null}
      {preview.length > 0 ? (
        <div className="max-h-40 overflow-auto rounded-md border border-line text-xs">
          <table className="w-full text-left">
            <thead className="bg-canvas text-ink-muted">
              <tr>
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1">Price</th>
                <th className="px-2 py-1">Stock</th>
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 20).map((r, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-2 py-1">{r.name}</td>
                  <td className="px-2 py-1">{r.item_kind}</td>
                  <td className="px-2 py-1 tabular-nums">{r.selling_price}</td>
                  <td className="px-2 py-1 tabular-nums">{r.item_kind === "service" ? "—" : r.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.length > 20 ? (
            <p className="px-2 py-1 text-ink-muted">…and {preview.length - 20} more</p>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={!preview.length} onClick={() => onImport(preview, categoryId)}>
          Import {preview.length || ""} {defaultKind}
          {preview.length === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}