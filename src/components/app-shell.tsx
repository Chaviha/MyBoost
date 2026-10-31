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
  Layers,
  LayoutDashboard,
  ListChecks,
  ListTree,
  Menu,
  MessageSquare,
  Package,
  PiggyBank,
  Receipt,
  Send,
  Settings,
  ShoppingCart,
  Store,
  Tags,
  TrendingUp,
  Users,
  Wallet,
  X,
  BriefcaseBusiness,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/avatar";
import { firstName, money } from "@/lib/format";
import { can, workspaceLabel, type Permission } from "@/lib/roles";
import { useLife } from "@/lib/store";
import type { Customer, LifeState, MoneyRequest, Offer, Quotation } from "@/lib/types";
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
    id: "main",
    section: "Main",
    items: [
      { to: "/", label: "Home", icon: LayoutDashboard },
      { to: "/marketplace", label: "Marketplace", icon: Store, perm: "view_marketplace" },
      { to: "/meetings", label: "Meetings", icon: MessageSquare },
      { to: "/offers", label: "Offers", icon: Gift },
    ],
  },
  {
    id: "business",
    section: "Business",
    items: [
      { to: "/businesses", label: "Businesses", icon: Building2, perm: "manage_own_businesses" },
      { to: "/customers", label: "Customers", icon: Users, perm: "manage_customers" },
      { to: "/employees", label: "Team", icon: BriefcaseBusiness, perm: "manage_employees" },
      { to: "/catalogue", label: "Catalogue", icon: Boxes, perm: "view_products" },
      { to: "/quotations", label: "Quotations", icon: ListChecks, perm: "manage_quotes" },
      { to: "/jobs", label: "Jobs", icon: ClipboardList, perm: "manage_jobs" },
      { to: "/sales", label: "Sales", icon: Wallet, perm: "manage_sales" },
      { to: "/expenses", label: "Expenses", icon: Receipt, perm: "manage_expenses" },
      { to: "/requests", label: "Requests", icon: Send, perm: "approve_requests" },
    ],
  },
  {
    id: "work",
    section: "My work",
    items: [
      { to: "/work", label: "My jobs", icon: ClipboardList, when: "employee" },
      { to: "/requests", label: "Requests", icon: Send, when: "employee" },
      { to: "/requests", label: "Requests", icon: Send, when: "customer" },
      { to: "/tab", label: "My orders", icon: ShoppingCart, when: "customer" },
    ],
  },
  {
    id: "money",
    section: "Money",
    items: [
      { to: "/assets", label: "Assets", icon: Landmark, perm: "manage_assets" },
      { to: "/income", label: "Income", icon: TrendingUp, perm: "view_finance" },
      { to: "/sacco", label: "Sacco", icon: PiggyBank, perm: "view_finance" },
      { to: "/collections", label: "Collections", icon: Bell, perm: "view_collections" },
    ],
  },
  {
    id: "admin",
    section: "Admin",
    items: [{ to: "/users", label: "Users", icon: ShieldCheck, perm: "manage_users" }],
  },
];

/** Paths that belong to each sidebar group — used to auto-open the active section. */
const GROUP_PATHS: Record<string, string[]> = {
  main: ["/", "/marketplace", "/meetings", "/offers"],
  business: [
    "/businesses",
    "/customers",
    "/employees",
    "/catalogue",
    "/categories",
    "/products",
    "/services",
    "/specifications",
    "/variants",
    "/inventory",
    "/pricing",
    "/quotations",
    "/jobs",
    "/sales",
    "/expenses",
    "/requests",
  ],
  work: ["/work", "/tab"],
  money: ["/assets", "/income", "/sacco", "/collections"],
  admin: ["/users"],
};

function groupForPath(pathname: string): string | null {
  for (const [id, paths] of Object.entries(GROUP_PATHS)) {
    for (const p of paths) {
      if (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)) {
        return id;
      }
    }
  }
  return null;
}

const BUSINESS_PAGES = new Set([
  "/sales",
  "/customers",
  "/employees",
  "/requests",
  "/collections",
  "/businesses",
  "/catalogue",
  "/products",
  "/services",
  "/categories",
  "/specifications",
  "/variants",
  "/inventory",
  "/expenses",
  "/quotations",
  "/jobs",
  "/offers",
]);

const CATALOGUE_PATHS = new Set([
  "/catalogue",
  "/categories",
  "/products",
  "/services",
  "/specifications",
  "/variants",
  "/inventory",
  "/pricing",
]);

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  if (to === "/catalogue") return CATALOGUE_PATHS.has(pathname) || pathname.startsWith("/catalogue/");
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
    businessRequests,
    myRequests,
    myOffers,
    businessQuotes,
  } = useLife();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Sections start collapsed so only the parent headings show; tap a heading to expand it.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

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

  const openMenu = () => {
    // Every time the menu is opened, collapse back to parents only.
    setOpenGroups({});
    setMobileOpen(true);
  };

  const mobileTabs = useMemo(() => {
    if (workspace === "admin") {
      return [
        { to: "/", label: "Home", icon: LayoutDashboard },
        { to: "/businesses", label: "Business", icon: Building2 },
        { to: "/marketplace", label: "Market", icon: Store },
        { to: "/users", label: "Users", icon: ShieldCheck },
      ];
    }
    if (workspace === "owner") {
      return [
        { to: "/", label: "Home", icon: LayoutDashboard },
        { to: "/quotations", label: "Quotes", icon: ListChecks },
        { to: "/jobs", label: "Jobs", icon: ClipboardList },
        { to: "/marketplace", label: "Market", icon: Store },
      ];
    }
    if (workspace === "customer") {
      return [
        { to: "/", label: "Home", icon: LayoutDashboard },
        { to: "/tab", label: "Orders", icon: ShoppingCart },
        { to: "/offers", label: "Offers", icon: Gift },
        { to: "/marketplace", label: "Market", icon: Store },
      ];
    }
    return [
      { to: "/", label: "Home", icon: LayoutDashboard },
      { to: "/work", label: "Jobs", icon: ClipboardList },
      { to: "/requests", label: "Requests", icon: Send },
      { to: "/marketplace", label: "Market", icon: Store },
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
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-paper shadow-border lg:shadow-none",
          "transition-transform duration-[var(--motion-fast)] ease-[var(--ease-smooth-out)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-4">
          <BoostMark />
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg leading-none font-medium tracking-tight">
              LifeBoostSME
            </p>
            <p className="mt-1.5 text-[11px] text-ink-muted">One app for work and money</p>
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
            const open = openGroups[group.id] === true;
            return (
              <div key={group.id} className="mb-2">
                <button
                  type="button"
                  aria-expanded={open}
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

        <div className="border-t border-line p-3 space-y-1">
          <Link
            to="/settings"
            aria-label="Open account settings"
            className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest transition-colors"
          >
            <Avatar src={currentUser.avatar_url} name={currentUser.name} size="sm" />
            <div className="min-w-0 text-left flex-1">
              <p className="truncate text-sm font-medium">{currentUser.name}</p>
              <p className="text-[11px] text-ink-muted">{kindLabel}</p>
            </div>
            <Settings className="size-3.5 shrink-0 text-ink-faint" />
          </Link>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-ink-muted hover:bg-danger-bg hover:text-clay transition-colors"
            onClick={() => void logout()}
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="lg:ml-64">
        <header className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 border-b border-line bg-paper/85 px-4 py-3 backdrop-blur-md lg:left-64">
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-lg text-ink hover:bg-canvas lg:hidden transition-colors"
            onClick={openMenu}
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
            <p className="truncate text-sm font-medium tracking-tight">{kindLabel} workspace</p>
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
          <NotificationsMenu
            currentUserId={currentUser.user_id}
            businessRequests={businessRequests}
            myRequests={myRequests}
            myOffers={myOffers}
            businessQuotes={businessQuotes}
            myTabs={myTabs}
            state={state}
            canApprove={allow("approve_requests")}
          />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                title="Account"
                className="inline-flex shrink-0 rounded-full outline-offset-2 transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest"
              >
                <Avatar
                  src={currentUser.avatar_url}
                  name={currentUser.name}
                  className="shadow-border ring-2 ring-transparent hover:ring-leaf"
                />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-50 min-w-52 overflow-hidden rounded-xl border border-line bg-paper p-1.5 shadow-border-hover animate-in fade-in-0 zoom-in-95"
              >
                <div className="border-b border-line px-3 py-2.5 mb-1">
                  <p className="truncate text-sm font-medium text-ink">{currentUser.name}</p>
                  <p className="truncate text-[11px] text-ink-muted">{kindLabel}</p>
                </div>
                <DropdownMenu.Item asChild>
                  <Link
                    to="/settings"
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink outline-none hover:bg-canvas focus:bg-canvas"
                  >
                    <Settings className="size-4 text-ink-muted" />
                    Account settings
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => void logout()}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-clay outline-none hover:bg-danger-bg focus:bg-danger-bg"
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </header>
        <div className="h-[68px]" aria-hidden />

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

        <main className="page-enter mx-auto w-full max-w-5xl px-4 py-6 pb-28 lg:px-8 lg:pb-10">
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
          onClick={openMenu}
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
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] sm:text-3xl leading-tight font-medium tracking-tight text-ink">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-xl text-sm text-ink-muted leading-relaxed">{subtitle}</p>
        ) : null}
      </div>
      {actionLabel && onAction ? (
        <Button onClick={onAction} className="shrink-0 shadow-border">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
type NotifItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  href: string;
  when: number;
  icon: typeof Bell;
};

function NotificationsMenu({
  currentUserId,
  businessRequests,
  myRequests,
  myOffers,
  businessQuotes,
  myTabs,
  state,
  canApprove,
}: {
  currentUserId: string;
  businessRequests: MoneyRequest[];
  myRequests: MoneyRequest[];
  myOffers: Offer[];
  businessQuotes: Quotation[];
  myTabs: Customer[];
  state: LifeState;
  canApprove: boolean;
}) {
  const [meetingItems, setMeetingItems] = useState<NotifItem[]>([]);
  const [serverItems, setServerItems] = useState<NotifItem[]>([]);
  const [open, setOpen] = useState(false);

  const loadMeetings = useCallback(async () => {
    try {
      const res = await fetch("/api/meetings", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const now = Date.now();
      const horizon = now + 7 * 24 * 60 * 60 * 1000;
      const items: NotifItem[] = (data.meetings || [])
        .filter((m: { status: string; start_at: string }) => {
          if (m.status === "Cancelled" || m.status === "Completed") return false;
          const t = new Date(m.start_at).getTime();
          return !Number.isNaN(t) && t >= now - 60 * 60 * 1000 && t <= horizon;
        })
        .map(
          (m: {
            meeting_id: string;
            title: string;
            start_at: string;
            organizer_name: string;
          }) => ({
            id: `meeting-${m.meeting_id}`,
            kind: "Meeting",
            title: m.title || "Upcoming meeting",
            detail: `${m.organizer_name || "Organizer"} · ${new Date(m.start_at).toLocaleString([], {
              dateStyle: "medium",
              timeStyle: "short",
            })}`,
            href: "/meetings",
            when: new Date(m.start_at).getTime() || 0,
            icon: CalendarClock,
          }),
        );
      setMeetingItems(items);
    } catch {
      /* offline / no meetings API */
    }
  }, []);

  useEffect(() => {
    void loadMeetings();
    const id = window.setInterval(() => void loadMeetings(), 60_000);
    return () => window.clearInterval(id);
  }, [loadMeetings]);

  useEffect(() => {
    if (open) void loadMeetings();
  }, [open, loadMeetings]);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { credentials: "include", cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      setServerItems((payload.notifications || []).map((item: { id: string; title: string; detail: string; href: string; created_at: string }) => ({
        id: `server-${item.id}`,
        kind: "LifeBoostSME notification",
        title: item.title || "Notification",
        detail: item.detail || "",
        href: item.href || "/",
        when: new Date(item.created_at).getTime() || 0,
        icon: Bell,
      })));
    } catch {
      /* notifications are optional while offline */
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    const id = window.setInterval(() => void loadNotifications(), 60_000);
    return () => window.clearInterval(id);
  }, [loadNotifications]);

  useEffect(() => {
    if (open) void loadNotifications();
  }, [open, loadNotifications]);

  const items = useMemo(() => {
    const list: NotifItem[] = [];

    // Requests now come from the server (customer/employee -> owner) as notifications.

    for (const o of myOffers.filter((x) => x.status === "Open")) {
      const kindLabel =
        o.kind === "employment"
          ? "Job offer"
          : o.kind === "customer"
            ? "Customer offer"
            : "Offer";
      list.push({
        id: `offer-${o.offer_id}`,
        kind: kindLabel,
        title: o.title || kindLabel,
        detail: `${o.from}${o.amount > 0 ? ` · ${money(o.amount)}` : ""}`,
        href: "/offers",
        when: Date.now(),
        icon: o.kind === "employment" ? BriefcaseBusiness : o.kind === "customer" ? Users : Gift,
      });
    }

    // Quotes received as a customer — never for businesses you own (those are outbound).
    const ownedBizIds = new Set(
      state.businesses
        .filter((b) => b.owner_user_id === currentUserId)
        .map((b) => b.business_id),
    );
    const tabIds = new Set(myTabs.map((t) => t.customer_id));
    const receivedQuotes = state.quotations.filter(
      (q) =>
        tabIds.has(q.customer_id) &&
        !ownedBizIds.has(q.business_id) &&
        (q.status === "Sent" ||
          q.status === "Pending" ||
          q.status === "Open" ||
          q.status === "Received" ||
          q.status === "Awaiting"),
    );
    for (const q of receivedQuotes) {
      const biz =
        state.businesses.find((b) => b.business_id === q.business_id)?.business_name ||
        "Business";
      list.push({
        id: `quote-in-${q.quote_id}`,
        kind: "Quotation received",
        title: `Quote from ${biz}`,
        detail: `${money(q.total)}${q.notes ? ` · ${q.notes.slice(0, 60)}` : ""}`,
        href: "/tab",
        when: new Date(q.date).getTime() || 0,
        icon: ListChecks,
      });
    }

    if (canApprove) {
      for (const q of businessQuotes.filter(
        (x) => x.status === "Sent" || x.status === "Pending" || x.status === "Open",
      )) {
        list.push({
          id: `quote-out-${q.quote_id}`,
          kind: "Quotation sent",
          title: `${q.customer_name}`,
          detail: `${money(q.total)} · awaiting response`,
          href: "/quotations",
          when: new Date(q.date).getTime() || 0,
          icon: ListChecks,
        });
      }
    }

    list.push(...meetingItems, ...serverItems);

    return list
      .sort((a, b) => b.when - a.when)
      .slice(0, 40);
  }, [
    businessQuotes,
    businessRequests,
    canApprove,
    currentUserId,
    meetingItems,
    serverItems,
    myOffers,
    myRequests,
    myTabs,
    state.businesses,
    state.employees,
    state.quotations,
    state.users,
  ]);

  const unread = items.length;

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={unread ? `${unread} notifications` : "Notifications"}
          title="Notifications"
          className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-canvas hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest"
        >
          <Bell className="size-5" />
          {unread > 0 ? (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(calc(100vw-1.5rem),22rem)] overflow-hidden rounded-xl border border-line bg-paper shadow-elevated"
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            <span className="text-[11px] text-ink-muted">{unread} open</span>
          </div>
          <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">
                You&apos;re all caught up. Requests, offers, meetings, and quotations will show here.
              </p>
            ) : (
              items.map((item) => (
                <DropdownMenu.Item key={item.id} asChild>
                  <Link
                    to={item.href}
                    className="flex cursor-pointer gap-3 border-b border-line/70 px-3 py-3 outline-none last:border-0 hover:bg-canvas focus:bg-canvas"
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-leaf text-forest">
                      <item.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-medium tracking-wide text-ink-faint uppercase">
                        {item.kind}
                      </span>
                      <span className="mt-0.5 block truncate text-sm font-medium text-ink">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-muted line-clamp-2">
                        {item.detail}
                      </span>
                    </span>
                  </Link>
                </DropdownMenu.Item>
              ))
            )}
          </div>
          <div className="grid grid-cols-3 gap-1 border-t border-line p-1.5">
            <Link
              to="/requests"
              className="rounded-lg px-2 py-1.5 text-center text-[11px] font-medium text-ink-muted hover:bg-canvas hover:text-ink"
              onClick={() => setOpen(false)}
            >
              Requests
            </Link>
            <Link
              to="/offers"
              className="rounded-lg px-2 py-1.5 text-center text-[11px] font-medium text-ink-muted hover:bg-canvas hover:text-ink"
              onClick={() => setOpen(false)}
            >
              Offers
            </Link>
            <Link
              to="/meetings"
              className="rounded-lg px-2 py-1.5 text-center text-[11px] font-medium text-ink-muted hover:bg-canvas hover:text-ink"
              onClick={() => setOpen(false)}
            >
              Meetings
            </Link>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
