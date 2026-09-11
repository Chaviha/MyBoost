import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultNotFoundComponent: () => (
      <div className="min-h-dvh bg-canvas flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="font-display text-3xl font-medium">Page not found</h1>
          <p className="mt-2 text-sm text-ink-muted">The LifeBoost page you requested does not exist.</p>
        </div>
      </div>
    ),
  });
}
