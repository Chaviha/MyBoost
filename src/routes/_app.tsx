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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const { authenticated, authLoading } = useLife();

  if (authLoading) return <div className="min-h-dvh bg-canvas" />;

  if (!authenticated) {
    // Landing is the home/auth experience. Marketplace stays public at /marketplace only.
    const params = new URLSearchParams(search || "");
    const wantsAuth =
      params.get("auth") === "login" ||
      params.get("auth") === "register" ||
      params.get("auth") === "forgot";
    if (pathname === "/marketplace" && !wantsAuth) return <PublicMarketplace />;
    return <AuthScreen />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
