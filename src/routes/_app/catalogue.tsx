import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, BriefcaseBusiness, Layers, ListTree, Package, Tags } from "lucide-react";
import { AccessDenied } from "@/components/access-denied";
import { Toolbar } from "@/components/app-shell";
import { CatalogueSubnav } from "@/components/catalogue-subnav";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/catalogue")({
  component: CatalogueOverviewPage,
});

const TREE = [
  {
    title: "Categories",
    blurb: "Group items (e.g. RHS, Plates, Labour, Transport).",
    to: "/categories",
    icon: Tags,
  },
  {
    title: "Items · Product",
    blurb: "Physical goods — specifications, options, pricing, stock.",
    to: "/products",
    icon: Boxes,
    children: [
      { label: "Specifications", to: "/specifications", icon: ListTree },
      { label: "Options (optional)", to: "/variants", icon: Layers },
      { label: "Pricing", to: "/products", icon: Boxes },
      { label: "Stock (optional)", to: "/inventory", icon: Package },
    ],
  },
  {
    title: "Items · Service",
    blurb: "Labour, cutting, transport, paint — specifications & pricing.",
    to: "/services",
    icon: BriefcaseBusiness,
    children: [
      { label: "Specifications", to: "/specifications", icon: ListTree },
      { label: "Pricing", to: "/services", icon: BriefcaseBusiness },
    ],
  },
] as const;

function CatalogueOverviewPage() {
  const { selectedBusiness, can } = useLife();

  if (!can("view_products")) {
    return <AccessDenied need="Catalogue is for business owners and staff with product access." />;
  }
  if (!selectedBusiness) {
    return <EmptyState icon={Boxes} text="Select or add a business first." />;
  }

  return (
    <>
      <Toolbar
        title="Catalogue"
        subtitle={`${selectedBusiness.business_name} — categories, products and services`}
      />
      <CatalogueSubnav />

      <div className="mb-6 rounded-xl border border-line bg-paper p-4 text-sm text-ink-muted">
        <pre className="font-sans text-xs leading-relaxed text-ink whitespace-pre-wrap">
{`CATALOGUE`}
        </pre>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TREE.map((node) => (
          <Card key={node.to} className="flex flex-col p-5">
            <Link
              to={node.to}
              className="flex items-start gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-forest/30"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-leaf text-forest">
                <node.icon className="size-5" />
              </span>
              <span>
                <span className="block font-medium text-ink">{node.title}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{node.blurb}</span>
              </span>
            </Link>
            {"children" in node && node.children ? (
              <ul className="mt-4 space-y-1.5 border-t border-line pt-3 pl-1">
                {node.children.map((c) => (
                  <li key={c.label}>
                    <Link
                      to={c.to}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-muted hover:bg-canvas hover:text-ink"
                    >
                      <c.icon className="size-3.5 shrink-0" />
                      {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        ))}
      </div>
    </>
  );
}
