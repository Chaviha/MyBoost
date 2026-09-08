import { useMemo, useState, type FormEvent } from "react";
import { useLife } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { toast } from "sonner";

function BoostMark() {
  return <span className="flex size-10 items-center justify-center rounded-md bg-forest text-forest-fg font-display font-semibold">L</span>;
}

export function AuthScreen() {
  const { login, register, requestPasswordReset, resetPassword } = useLife();
  const params = useMemo(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search), []);
  const resetToken = params.get("reset");
  const requestedMode = params.get("auth");
  const initialMode = resetToken ? "reset" : requestedMode === "register" ? "register" : requestedMode === "forgot" ? "forgot" : "login";
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">(initialMode);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        await login(form.email, form.password);
        toast.success("Welcome back.");
      } else if (mode === "register") {
        if (form.password !== form.confirm) throw new Error("Passwords do not match");
        await register(form);
        toast.success("Your LifeBoost account is ready.");
      } else if (mode === "forgot") {
        const result = await requestPasswordReset(form.email);
        if (result.resetUrl) toast.success("Reset link generated for local development.");
        else toast.success("If the email exists, a reset link has been prepared.");
      } else {
        if (!resetToken) throw new Error("Reset token is missing");
        if (form.password !== form.confirm) throw new Error("Passwords do not match");
        await resetPassword(resetToken, form.password);
        window.history.replaceState({}, "", window.location.pathname);
        setMode("login");
        toast.success("Password changed. Sign in with your new password.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "login" ? "Welcome back" : mode === "register" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Choose a new password";
  return (
    <div className="min-h-dvh bg-canvas px-4 py-10 text-ink">
      <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <Card className="w-full p-6 sm:p-8">
          <div className="mb-7 flex items-center gap-3">
            <BoostMark />
            <div><p className="font-display text-xl font-semibold">LifeBoost</p><p className="text-xs text-ink-muted">One app for work and money</p></div>
          </div>
          <h1 className="font-display text-3xl font-medium tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-ink-muted">Your account and business data are stored securely in PostgreSQL.</p>
          <form className="mt-6 space-y-3" onSubmit={submit}>
            {mode === "register" ? <><Field label="Full name"><Input required value={form.name} onChange={e => setForm({...form, name:e.target.value})} /></Field><Field label="Phone"><Input value={form.phone} onChange={e => setForm({...form, phone:e.target.value})} /></Field></> : null}
            {mode !== "reset" ? <Field label="Email"><Input required type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})} /></Field> : null}
            {mode !== "forgot" ? <Field label="Password"><Input required minLength={8} type="password" value={form.password} onChange={e => setForm({...form, password:e.target.value})} /></Field> : null}
            {(mode === "register" || mode === "reset") ? <Field label="Confirm password"><Input required minLength={8} type="password" value={form.confirm} onChange={e => setForm({...form, confirm:e.target.value})} /></Field> : null}
            <Button type="submit" className="mt-2 w-full" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : "Change password"}</Button>
          </form>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-forest">
            {mode === "login" ? <><button type="button" onClick={() => setMode("register")}>Create account</button><button type="button" onClick={() => setMode("forgot")}>Forgot password?</button></> : <button type="button" onClick={() => setMode("login")}>Back to sign in</button>}
          </div>
        </Card>
      </div>
    </div>
  );
}
