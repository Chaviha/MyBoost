import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Boxes,
  Building2,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  CreditCard,
  Gift,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Menu,
  PiggyBank,
  Receipt,
  Send,
  Settings,
  ShoppingCart,
  Store,
  TrendingUp,
  Users,
  Wallet,
  X,
  BriefcaseBusiness,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/avatar";
import { firstName } from "@/lib/format";
import { can, workspaceLabel, type Permission } from "@/lib/roles";
import { useLife } from "@/lib/store";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  perm?: Permission;
  when?: "customer" | "employee" | "owner";
};

type NavGroup = {
  id: string;
  section: string;
  items: NavItem[];
};

const NAV: NavGroup[] = [
  {
    id: "home",
    section: "Home",
    items: [
      { to: "/", label: "Overview", icon: LayoutDashboard },
      { to: "/marketplace", label: "Marketplace", icon: Store, perm: "view_marketplace" },
    ],
  },
  {
    id: "business",
    section: "My businesses",
    items: [
      { to: "/businesses", label: "Overview", icon: ClipboardList, perm: "manage_own_businesses" },
      { to: "/employees", label: "Professionals", icon: BriefcaseBusiness, perm: "manage_employees" },
      { to: "/customers", label: "Customers", icon: Users, perm: "manage_customers" },
      { to: "/products", label: "Products", icon: Boxes, perm: "view_products" },
      { to: "/sales", label: "Sales", icon: Wallet, perm: "manage_sales" },
      { to: "/expenses", label: "Expenses", icon: Receipt, perm: "manage_expenses" },
      { to: "/quotations", label: "Quotations", icon: ListChecks, perm: "manage_quotes" },
      { to: "/invoices", label: "Invoices", icon: CreditCard, perm: "manage_quotes" },
      { to: "/jobs", label: "Jobs", icon: ClipboardList, perm: "manage_jobs" },
      { to: "/requests", label: "Requests", icon: CreditCard, perm: "approve_requests" },
    ],
  },
  {
    id: "professional",
    section: "Professional",
    items: [
      { to: "/work", label: "My jobs", icon: ClipboardList, when: "employee" },
      { to: "/work", label: "Deadlines", icon: CalendarClock, when: "employee" },
      { to: "/requests", label: "Send request", icon: Send, when: "employee" },
    ],
  },
  {
    id: "customer",
    section: "Customer",
    items: [
      { to: "/tab", label: "My orders", icon: ShoppingCart, when: "customer" },
      { to: "/tab", label: "Payments", icon: CreditCard, when: "customer" },
    ],
  },
  {
    id: "finance",
    section: "Finance",
    items: [
      { to: "/assets", label: "Assets", icon: Landmark, perm: "manage_assets" },
      { to: "/income", label: "Income", icon: TrendingUp, perm: "view_finance" },
      { to: "/sacco", label: "Sacco", icon: PiggyBank, perm: "view_finance" },
      { to: "/offers", label: "Offers", icon: Gift, perm: "view_finance" },
      { to: "/collections", label: "Collections", icon: Bell, perm: "view_collections" },
    ],
  },
  {
    id: "admin",
    section: "Admin",
    items: [{ to: "/users", label: "Users & roles", icon: ShieldCheck, perm: "manage_users" }],
  },
  {
    id: "account",
    section: "Account",
    items: [{ to: "/settings", label: "Settings", icon: Settings }],
  },
];

const BUSINESS_PAGES = new Set([
  "/sales",
  "/customers",
  "/employees",
  "/requests",
  "/collections",
  "/businesses",
  "/products",
  "/expenses",
  "/quotations",
  "/invoices",
  "/jobs",
]);

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const {
    currentUser,
    visibleBusinesses,
    selectedBusiness,
    setSelectedBusinessId,
    can: allow,
    workspace,
    myTabs,
    state,
    logout,
  } = useLife();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    home: true,
    business: true,
    professional: true,
    customer: true,
    finance: true,
    admin: true,
    account: true,
  });
  const kindLabel = workspaceLabel(currentUser, state.relationships);

  const groups = useMemo(
    () =>
      NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.when === "customer") return myTabs.length > 0;
          if (item.when === "employee") return workspace === "employee";
          if (item.when === "owner") return workspace === "owner" || workspace === "admin";
          if (item.perm && !allow(item.perm)) return false;
          return true;
        }),
      })).filter((group) => group.items.length > 0),
    [allow, myTabs.length, workspace],
  );

  const mobileTabs = useMemo(() => {
    if (workspace === "admin") {
      return [
        { to: "/", label: "Home", icon: LayoutDashboard },
        { to: "/users", label: "Users", icon: ShieldCheck },
        { to: "/marketplace", label: "Market", icon: Store },
        { to: "/businesses", label: "Firms", icon: Building2 },
      ];
    }
    if (workspace === "owner") {
      return [
        { to: "/", label: "Home", icon: LayoutDashboard },
        { to: "/customers", label: "Tabs", icon: Users },
        { to: "/jobs", label: "Jobs", icon: ClipboardList },
        { to: "/marketplace", label: "Market", icon: Store },
      ];
    }
    if (workspace === "customer") {
      return [
        { to: "/", label: "Home", icon: LayoutDashboard },
        { to: "/tab", label: "Orders", icon: ShoppingCart },
        { to: "/marketplace", label: "Market", icon: Store },
        { to: "/assets", label: "Assets", icon: Landmark },
      ];
    }
    return [
      { to: "/", label: "Home", icon: LayoutDashboard },
      { to: "/work", label: "Jobs", icon: ClipboardList },
      { to: "/marketplace", label: "Market", icon: Store },
      { to: "/requests", label: "Asks", icon: CreditCard },
    ];
  }, [workspace]);

  const showSwitcher =
    BUSINESS_PAGES.has(pathname) &&
    visibleBusinesses.length > 0 &&
    can(currentUser.account_level, "manage_own_businesses");

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <Toaster
        position="top-center"
        toastOptions={{
          className: "font-sans",
          style: {
            background: "var(--color-paper)",
            color: "var(--color-ink)",
            border: "1px solid var(--color-line)",
          },
        }}
      />

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-paper",
          "transition-transform duration-[var(--motion-fast)] ease-[var(--ease-smooth-out)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
          <BoostMark />
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg leading-none font-medium tracking-tight">
              LifeBoost
            </p>
            <p className="mt-1 text-[11px] text-ink-muted">One app for work and money</p>
          </div>
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-md text-ink-muted lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group) => {
            const open = openGroups[group.id] !== false;
            return (
              <div key={group.id} className="mb-2">
                <button
                  type="button"
                  className="flex h-9 w-full items-center justify-between rounded-md px-3 text-[10px] font-medium tracking-[0.16em] text-ink-faint uppercase"
                  onClick={() =>
                    setOpenGroups((prev) => ({ ...prev, [group.id]: !open }))
                  }
                >
                  {group.section}
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform duration-[var(--motion-quick)]",
                      open ? "rotate-0" : "-rotate-90",
                    )}
                  />
                </button>
                {open ? (
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((item) => (
                      <Link
                        key={`${group.id}-${item.label}-${item.to}`}
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex h-11 items-center gap-2.5 rounded-md px-3 text-sm",
                          isActive(pathname, item.to)
                            ? "bg-leaf font-medium text-forest"
                            : "text-ink-muted hover:bg-canvas hover:text-ink",
                        )}
                      >
                        <item.icon className="size-4 shrink-0" />
                        {item.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          <button
            type="button"
            className="mb-3 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-ink-muted hover:bg-canvas hover:text-ink"
            onClick={() => void logout()}
          >
            <LogOut className="size-4" />
            Sign out
          </button>
          <div className="mt-3 flex items-center gap-2.5 px-1">
            <Avatar src={currentUser.avatar_url} name={currentUser.name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{currentUser.name}</p>
              <p className="text-[11px] text-ink-muted">{kindLabel}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:ml-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur-sm">
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-md text-ink lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-ink-muted">
              {showSwitcher
                ? selectedBusiness?.business_name || "Choose a business"
                : `Good to see you, ${firstName(currentUser.name)}`}
            </p>
            <p className="truncate text-sm font-medium">{kindLabel} workspace</p>
          </div>
          {showSwitcher ? (
            <div className="hidden min-w-40 sm:block">
              <Select
                value={selectedBusiness?.business_id ?? ""}
                onChange={(e) => setSelectedBusinessId(e.target.value)}
                aria-label="Switch business"
              >
                {visibleBusinesses.map((b) => (
                  <option key={b.business_id} value={b.business_id}>
                    {b.business_name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <Avatar
            src={currentUser.avatar_url}
            name={currentUser.name}
            className="shadow-border"
          />
        </header>

        {showSwitcher ? (
          <div className="border-b border-line px-4 py-2 sm:hidden">
            <Select
              value={selectedBusiness?.business_id ?? ""}
              onChange={(e) => setSelectedBusinessId(e.target.value)}
              aria-label="Switch business"
            >
              {visibleBusinesses.map((b) => (
                <option key={b.business_id} value={b.business_id}>
                  {b.business_name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-28 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden">
        {mobileTabs.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px]",
              isActive(pathname, item.to) ? "text-forest" : "text-ink-muted",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] text-ink-muted"
        >
          <Menu className="size-4" />
          More
        </button>
      </nav>
    </div>
  );
}

function BoostMark() {
  return (
    <span className="flex size-9 items-center justify-center rounded-md bg-forest text-forest-fg">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
        <path
          d="M5 16.5 12 4l7 12.5h-4.2L12 11.2 9.2 16.5H5Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

export function Toolbar({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl leading-tight font-medium tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-xl text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {actionLabel && onAction ? (
        <Button onClick={onAction} className="shrink-0">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
