
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { AuthScreen } from "@/components/auth-screen";
import { PublicMarketplace } from "@/components/public-marketplace";
import { LifeProvider, useLife } from "@/lib/store";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <LifeProvider>
      <AuthenticatedLayout />
    </LifeProvider>
  );
}

function AuthenticatedLayout() {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const search = useRouterState({
    select: (s) => s.location.searchStr,
  });

  const { authenticated, authLoading } = useLife();

  const params = new URLSearchParams(search || "");
  const wantsAuth =
    params.get("auth") === "login" ||
    params.get("auth") === "register" ||
    params.get("auth") === "forgot";

  // Always show the public Marketplace at the website root.
  // Login and registration URLs remain available.
  if (pathname === "/" && !wantsAuth) {
    return <PublicMarketplace />;
  }

  if (authLoading) {
    return <div className="min-h-dvh bg-canvas" />;
  }

  if (!authenticated) {
    // Keep the Marketplace accessible to signed-out visitors.
    if (pathname === "/marketplace" && !wantsAuth) {
      return <PublicMarketplace />;
    }

    return <AuthScreen />;
  }

  // Preserve the existing signed-in application and dashboard.
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
