import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  Download,
  FileText,
  Loader2,
  Package,
  Printer,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IMAGE_ACCEPT, readAvatarFile } from "@/lib/media";
import {
  downloadPageBrochure,
  printPageBrochure,
  type BrochureItem,
} from "@/lib/page-brochure";
import { roleLabel } from "@/lib/roles";
import { useLife } from "@/lib/store";
import type { Asset, Business, Product } from "@/lib/types";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const life = useLife();
  const {
    currentUser,
    visibleBusinesses = [],
    myConnections = [],
    businessProducts = [],
    myAssets = [],
    saveProfile,
    uploadAvatar,
    removeAvatar,
    can,
  } = life;

  const products = useMemo(
    () => (Array.isArray(businessProducts) ? businessProducts : []) as Product[],
    [businessProducts],
  );
  const assets = useMemo(
    () => (Array.isArray(myAssets) ? myAssets : []) as Asset[],
    [myAssets],
  );
  const businesses = useMemo(
    () => (Array.isArray(visibleBusinesses) ? visibleBusinesses : []) as Business[],
    [visibleBusinesses],
  );

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your LifeBoost account." />
      <Tabs defaultValue="profile">
        <TabsList className="mb-4 w-full max-w-full overflow-x-auto">
          <TabsTrigger value="profile">
            <UserRound className="size-3.5" />
            Profile
          </TabsTrigger>
          {can("manage_own_businesses") ? (
            <TabsTrigger value="businesses">
              <Building2 className="size-3.5" />
              Businesses
            </TabsTrigger>
          ) : (
            <TabsTrigger value="businesses">
              <Building2 className="size-3.5" />
              Connections
            </TabsTrigger>
          )}
          <TabsTrigger value="brochures">
            <FileText className="size-3.5" />
            Brochures
          </TabsTrigger>
          <TabsTrigger value="security">
            <ShieldCheck className="size-3.5" />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileForm
            key={currentUser.user_id}
            user={currentUser}
            onSave={(form) => {
              saveProfile(form);
              toast.success("Profile saved.");
            }}
            onUploadAvatar={uploadAvatar}
            onRemoveAvatar={removeAvatar}
          />
        </TabsContent>

        {can("manage_own_businesses") ? (
          <TabsContent value="businesses">
            <Card className="p-5">
              <h2 className="font-display text-xl font-medium">My businesses</h2>
              <p className="mt-1 mb-4 text-sm text-ink-muted">Connected to this account.</p>
              {businesses.map((b) => (
                <div
                  key={b.business_id}
                  className="flex items-center gap-3 border-b border-line py-3 last:border-0"
                >
                  <Building2 className="size-5 text-ink-faint" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{b.business_name}</p>
                    <p className="text-xs text-ink-muted">{b.business_type}</p>
                  </div>
                  <Badge tone="forest">{b.status}</Badge>
                </div>
              ))}
              {businesses.length === 0 ? (
                <EmptyState icon={Building2} text="No businesses yet." compact />
              ) : null}
            </Card>
          </TabsContent>
        ) : (
          <TabsContent value="businesses">
            <Card className="p-5">
              <h2 className="font-display text-xl font-medium">My connections</h2>
              <p className="mt-1 mb-4 text-sm text-ink-muted">
                Businesses you&apos;re linked to as an employee or customer. Accept invites from the
                Offers page to see them here.
              </p>
              {(myConnections as { relationship: { relationship_id: string; role: string; relationship_type: string }; business?: Business }[]).map(
                ({ relationship, business }) => (
                  <div
                    key={relationship.relationship_id}
                    className="flex items-center gap-3 border-b border-line py-3 last:border-0"
                  >
                    <Building2 className="size-5 text-ink-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{business?.business_name ?? "Business"}</p>
                      <p className="text-xs text-ink-muted">{relationship.role}</p>
                    </div>
                    <Badge tone="forest" className="capitalize">
                      {relationship.relationship_type}
                    </Badge>
                  </div>
                ),
              )}
              {(myConnections as unknown[]).length === 0 ? (
                <EmptyState
                  icon={Building2}
                  text="No businesses yet. Check Offers for pending invites."
                  compact
                />
              ) : null}
            </Card>
          </TabsContent>
        )}

        <TabsContent value="brochures">
          <BrochuresPanel
            products={products}
            assets={assets}
            businesses={businesses}
            preparedBy={currentUser?.name || ""}
            phone={currentUser?.phone || ""}
            email={currentUser?.email || ""}
          />
        </TabsContent>

        <TabsContent value="security">
          <Card className="p-5">
            <h2 className="font-display text-xl font-medium">Security</h2>
            <p className="mt-2 text-sm text-ink-muted">
              You are on the {roleLabel(currentUser.account_level)} role. Your sign-in uses an
              HttpOnly session cookie and your LifeBoost workspace is persisted in PostgreSQL.
              Password resets use short-lived, single-use tokens.
            </p>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function productToItem(p: Product): BrochureItem {
  const specs: Record<string, string | number> = {};
  if (p.status) specs.Status = p.status;
  if (p.category) specs.Category = p.category;
  if (p.family) specs.Family = p.family;
  if (p.sku) specs.SKU = p.sku;
  if (p.unit) specs.Unit = p.unit;
  if (p.listed != null) specs.Listed = p.listed ? "Yes" : "No";
  if (p.specs && typeof p.specs === "object") {
    for (const [k, v] of Object.entries(p.specs)) {
      if (v === "" || v == null) continue;
      specs[k] = v as string | number;
    }
  }
  return {
    name: p.name || "Untitled",
    type: p.item_kind === "service" ? "Service" : p.category || "Product",
    description: p.description || "",
    image_url: p.image_url || "",
    gallery: Array.isArray(p.gallery)
      ? p.gallery.map((m) => ({
          url: m.url,
          name: m.name,
          media_type: m.media_type,
        }))
      : [],
    specs,
  };
}

function assetToItem(a: Asset): BrochureItem {
  const specs: Record<string, string | number> = {};
  if (a.status) specs.Status = a.status;
  else if (a.listed) specs.Status = a.listing_type || "Listed";
  if (a.location) specs.Location = a.location;
  if (a.type) specs.Type = a.type;
  return {
    name: a.name || "Untitled",
    type: a.type || "Asset",
    description: a.notes || "",
    image_url: a.image_url || "",
    gallery: Array.isArray(a.gallery)
      ? a.gallery.map((m) => ({
          url: m.url,
          name: m.name,
          media_type: m.media_type,
        }))
      : [],
    specs,
    location: a.location || "",
    phone: a.phone || "",
  };
}

function businessToItem(b: Business): BrochureItem {
  const specs: Record<string, string | number> = {};
  if (b.status) specs.Status = b.status;
  if (b.business_type) specs.Type = b.business_type;
  if (b.region) specs.Region = b.region;
  return {
    name: b.business_name || "Business",
    type: b.business_type || "Business",
    description: b.tagline || "",
    image_url: b.image_url || "",
    gallery: Array.isArray(b.gallery)
      ? b.gallery.map((m) => ({
          url: m.url,
          name: m.name,
          media_type: m.media_type,
        }))
      : [],
    specs,
    location: b.region || "",
    phone: b.phone || "",
    email: b.email || "",
  };
}

function BrochuresPanel({
  products,
  assets,
  businesses,
  preparedBy,
  phone,
  email,
}: {
  products: Product[];
  assets: Asset[];
  businesses: Business[];
  preparedBy: string;
  phone: string;
  email: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(
    key: string,
    items: BrochureItem[],
    title: string,
    mode: "print" | "download",
  ) {
    if (!items.length) {
      toast.message(`No ${title.toLowerCase()} to export.`);
      return;
    }
    setBusy(key);
    try {
      toast.message("Preparing images…");
      const meta = { title, preparedBy, phone, email };
      if (mode === "print") {
        await printPageBrochure(items, meta);
        toast.success("Brochure opened — use Print → Save as PDF.");
      } else {
        await downloadPageBrochure(items, meta);
        toast.success("Brochure downloaded.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create brochure.");
    } finally {
      setBusy(null);
    }
  }

  const rows = [
    {
      key: "products",
      label: "Products & services",
      hint: "Catalogue items with photos, description, and specs",
      count: products.length,
      items: products.map(productToItem),
      icon: Package,
    },
    {
      key: "assets",
      label: "Assets",
      hint: "Images, description, status, location, contacts, video links",
      count: assets.length,
      items: assets.map(assetToItem),
      icon: FileText,
    },
    {
      key: "businesses",
      label: "Businesses",
      hint: "Business profiles with gallery and contact details",
      count: businesses.length,
      items: businesses.map(businessToItem),
      icon: Building2,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h2 className="font-display text-xl font-medium">Download brochures</h2>
        <p className="mt-1 mb-1 text-sm text-ink-muted">
          Export page data as clean brochure pages — images, description, specifications, address
          and contacts only. No app headers.
        </p>
        <p className="mb-4 text-xs text-ink-faint">
          Each item becomes its own brochure page. Images are embedded so they print correctly.
        </p>

        <div className="flex flex-col gap-3">
          {rows.map((row) => {
            const Icon = row.icon;
            const isBusy = busy === row.key || busy === `${row.key}-dl`;
            return (
              <div
                key={row.key}
                className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-forest/10 text-forest">
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{row.label}</p>
                    <p className="text-sm text-ink-muted">{row.hint}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {row.count} item{row.count === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isBusy || row.count === 0}
                    onClick={() => void run(row.key, row.items, row.label, "print")}
                  >
                    {busy === row.key ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Printer className="size-3.5" />
                    )}
                    Print / PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isBusy || row.count === 0}
                    onClick={() => void run(`${row.key}-dl`, row.items, row.label, "download")}
                  >
                    {busy === `${row.key}-dl` ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    Download
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function ProfileForm({
  user,
  onSave,
  onUploadAvatar,
  onRemoveAvatar,
}: {
  user: { name: string; email: string; phone: string; avatar_url?: string };
  onSave: (form: { name: string; email: string; phone: string }) => void;
  onUploadAvatar: (file: {
    name: string;
    dataUrl: string;
    media_type: "image";
  }) => Promise<void>;
  onRemoveAvatar: () => Promise<void>;
}) {
  const [form, setForm] = useState({ name: user.name, email: user.email, phone: user.phone });
  const [avatarBusy, setAvatarBusy] = useState<"upload" | "remove" | null>(null);
  useEffect(() => {
    setForm({ name: user.name, email: user.email, phone: user.phone });
  }, [user]);

  async function handleAvatarFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setAvatarBusy("upload");
    try {
      const staged = await readAvatarFile(file);
      await onUploadAvatar(staged);
      toast.success("Profile photo updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update photo.");
    } finally {
      setAvatarBusy(null);
    }
  }

  async function handleRemoveAvatar() {
    setAvatarBusy("remove");
    try {
      await onRemoveAvatar();
      toast.success("Profile photo removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove photo.");
    } finally {
      setAvatarBusy(null);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="font-display text-xl font-medium">My profile</h2>
      <p className="mt-1 mb-4 text-sm text-ink-muted">Your personal LifeBoost account details.</p>

      <div className="mb-5 flex items-center gap-4">
        <Avatar src={user.avatar_url} name={user.name} size="lg" />
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas">
              {avatarBusy === "upload" ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {user.avatar_url ? "Change photo" : "Add photo"}
              <input
                type="file"
                accept={IMAGE_ACCEPT}
                className="hidden"
                disabled={avatarBusy !== null}
                onChange={(e) => {
                  void handleAvatarFile(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {user.avatar_url ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={avatarBusy !== null}
                onClick={() => void handleRemoveAvatar()}
              >
                {avatarBusy === "remove" ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Remove
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-ink-faint">JPG, PNG, WEBP or GIF, up to 6MB.</p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}
      >
        <Field label="Full name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Button type="submit">Save profile</Button>
      </form>
    </Card>
  );
}
