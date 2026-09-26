import { createFileRoute } from "@tanstack/react-router";
import { CatalogueItemsPage } from "./products";

export const Route = createFileRoute("/_app/services")({
  component: ServicesPage,
});

function ServicesPage() {
  return <CatalogueItemsPage itemKind="service" />;
}
