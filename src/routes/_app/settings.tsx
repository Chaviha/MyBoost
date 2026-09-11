import { createFileRoute } from "@tanstack/react-router";
import { Building2, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
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
import { roleLabel } from "@/lib/roles";
import { useLife } from "@/lib/store";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { currentUser, visibleBusinesses, myConnections, saveProfile, uploadAvatar, removeAvatar, can } =
    useLife();

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
              {visibleBusinesses.map((b) => (
                <div key={b.business_id} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
                  <Building2 className="size-5 text-ink-faint" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{b.business_name}</p>
                    <p className="text-xs text-ink-muted">{b.business_type}</p>
                  </div>
                  <Badge tone="forest">{b.status}</Badge>
                </div>
              ))}
              {visibleBusinesses.length === 0 ? (
                <EmptyState icon={Building2} text="No businesses yet." compact />
              ) : null}
            </Card>
          </TabsContent>
        ) : (
          <TabsContent value="businesses">
            <Card className="p-5">
              <h2 className="font-display text-xl font-medium">My connections</h2>
              <p className="mt-1 mb-4 text-sm text-ink-muted">
                Businesses you're linked to as an employee or customer. Accept invites from the
                Offers page to see them here.
              </p>
              {myConnections.map(({ relationship, business }) => (
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
              ))}
              {myConnections.length === 0 ? (
                <EmptyState icon={Building2} text="No businesses yet. Check Offers for pending invites." compact />
              ) : null}
            </Card>
          </TabsContent>
        )}
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

function ProfileForm({
  user,
  onSave,
  onUploadAvatar,
  onRemoveAvatar,
}: {
  user: { name: string; email: string; phone: string; avatar_url?: string };
  onSave: (form: { name: string; email: string; phone: string }) => void;
  onUploadAvatar: (file: { name: string; dataUrl: string; media_type: "image" }) => Promise<void>;
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