import { ImagePlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  readImages,
  workApi,
  type PickedImage,
  type RequestImage,
  type RequestKind,
  type WorkRequest,
  type WorkTarget,
} from "@/lib/work-api";

const KINDS: RequestKind[] = ["Progress update", "Question", "Money", "Other"];

export function ImageStrip({ images }: { images: RequestImage[] }) {
  if (!images?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {images.map((img) => (
        <a key={img.url} href={img.url} target="_blank" rel="noreferrer" title={img.name}>
          <img src={img.url} alt={img.name} className="size-20 rounded-lg border border-line object-cover" />
        </a>
      ))}
    </div>
  );
}

export function ImagePicker({
  images,
  onChange,
  label = "Add photos",
}: {
  images: PickedImage[];
  onChange: (images: PickedImage[]) => void;
  label?: string;
}) {
  return (
    <div>
      <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-sm text-ink hover:bg-canvas">
        <ImagePlus className="size-3.5" />
        {label}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={async (e) => {
            try {
              const picked = await readImages(e.target.files, 6 - images.length);
              onChange([...images, ...picked].slice(0, 6));
            } catch {
              toast.error("Could not read that image.");
            }
            e.target.value = "";
          }}
        />
      </label>
      {images.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={`${img.name}-${i}`} className="relative">
              <img src={img.data_url} alt={img.name} className="size-16 rounded-lg border border-line object-cover" />
              <button
                type="button"
                aria-label="Remove image"
                onClick={() => onChange(images.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 inline-flex size-5 items-center justify-center rounded-full bg-ink text-paper"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Employee or customer -> business owner. Owners never see this form. */
export function SendRequestDialog({
  open,
  onClose,
  targets,
  businessId,
  jobId,
  defaultKind = "Progress update",
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  targets: WorkTarget[];
  businessId?: string;
  jobId?: string;
  defaultKind?: RequestKind;
  onSent?: (requests: WorkRequest[]) => void;
}) {
  const [biz, setBiz] = useState("");
  const [job, setJob] = useState("");
  const [kind, setKind] = useState<RequestKind>(defaultKind);
  const [amount, setAmount] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const first = targets.find((t) => t.business_id === businessId) ?? targets[0];
    setBiz(first?.business_id ?? "");
    setJob(jobId ?? "");
    setKind(defaultKind);
    setAmount("");
    setBody("");
    setImages([]);
  }, [open, businessId, jobId, defaultKind, targets]);

  const target = useMemo(() => targets.find((t) => t.business_id === biz), [targets, biz]);

  async function submit() {
    if (!target) return;
    setBusy(true);
    try {
      const requests = await workApi.createRequest({
        businessId: target.business_id,
        role: target.role,
        jobId: job || undefined,
        kind,
        amount: kind === "Money" ? Number(amount || 0) : undefined,
        body,
        images,
      });
      toast.success(`Sent to the owner of ${target.business_name}.`);
      onSent?.(requests);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send a request to the owner</DialogTitle>
          <DialogDescription>
            Share progress with text and photos, ask a question, or request money. It goes straight to the
            business owner.
          </DialogDescription>
        </DialogHeader>
        {targets.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">
            You are not linked to a business yet. Once an owner adds you and you accept, you can send requests.
          </p>
        ) : (
          <form
            className="mt-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {targets.length > 1 ? (
              <Field label="Business">
                <Select
                  value={biz}
                  onChange={(e) => {
                    setBiz(e.target.value);
                    setJob("");
                  }}
                >
                  {targets.map((t) => (
                    <option key={`${t.business_id}-${t.role}`} value={t.business_id}>
                      {t.business_name} ({t.role})
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <p className="mb-3 text-sm text-ink-muted">
                To: owner of <span className="font-medium text-ink">{target?.business_name}</span>
              </p>
            )}
            {target?.jobs.length ? (
              <Field label="About job (optional)">
                <Select value={job} onChange={(e) => setJob(e.target.value)}>
                  <option value="">General</option>
                  {target.jobs.map((j) => (
                    <option key={j.job_id} value={j.job_id}>
                      {j.title} · {j.status}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Type">
              <Select value={kind} onChange={(e) => setKind(e.target.value as RequestKind)}>
                {KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </Select>
            </Field>
            {kind === "Money" ? (
              <Field label="Amount (KSh)">
                <Input required type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
            ) : null}
            <Field label="Message">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={kind === "Progress update" ? "e.g. Frames welded, starting grinding tomorrow" : ""}
              />
            </Field>
            <ImagePicker images={images} onChange={setImages} />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || (!body.trim() && images.length === 0)}>
                {busy ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
