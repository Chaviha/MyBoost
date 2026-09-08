import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Star, Trash2, Video } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MEDIA_ACCEPT, readMediaFiles, type StagedMedia } from "@/lib/media";
import type { MediaItem } from "@/lib/types";

/** Picker used inside a create form: stages files locally, uploaded after the record is saved. */
export function MediaPicker({
  value,
  onChange,
  limit = 10,
  label = "Photos & videos",
  hint = "First photo becomes the cover. Up to 10 files — images up to 6MB, videos up to 40MB.",
}: {
  value: StagedMedia[];
  onChange: (next: StagedMedia[]) => void;
  limit?: number;
  label?: string;
  hint?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setLoading(true);
    try {
      const media = await readMediaFiles(files, limit);
      onChange([...value, ...media].slice(0, limit));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to read file.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-3">
      <label className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      <p className="mb-1.5 text-xs text-ink-faint">{hint}</p>
      <Input
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        onChange={(e) => void handleFiles(e.target.files)}
        disabled={loading}
      />
      {value.length ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {value.map((media, index) => (
            <div
              key={`${media.name}-${index}`}
              className="relative aspect-square overflow-hidden rounded-lg border border-line bg-paper"
            >
              {media.media_type === "video" ? (
                <video src={media.dataUrl} className="h-full w-full object-cover" muted />
              ) : (
                <img src={media.dataUrl} alt={media.name} className="h-full w-full object-cover" />
              )}
              {media.media_type === "video" ? (
                <span className="absolute left-1 top-1 rounded bg-ink/80 p-1 text-white">
                  <Video className="size-3" />
                </span>
              ) : null}
              {index === 0 && media.media_type === "image" ? (
                <span className="absolute bottom-1 left-1 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] text-white">
                  Cover
                </span>
              ) : null}
              <button
                type="button"
                className="absolute right-1 top-1 rounded bg-paper/90 px-1.5 py-0.5 text-xs"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Dialog for adding/removing photos & videos on an already-created business or asset. */
export function MediaManagerDialog({
  open,
  onClose,
  title,
  gallery,
  coverUrl,
  onUpload,
  onRemove,
  onReorder,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  gallery: MediaItem[];
  /** URL of the item currently used as the cover image (business/asset image_url). */
  coverUrl?: string;
  onUpload: (files: StagedMedia[]) => Promise<void>;
  onRemove: (mediaId: string) => Promise<void>;
  /** Reorders the gallery; the first image in the list becomes the new cover. */
  onReorder?: (order: string[]) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const media = await readMediaFiles(files);
      await onUpload(media);
      toast.success(media.length > 1 ? "Files added." : "File added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to upload file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(mediaId: string) {
    setRemovingId(mediaId);
    try {
      await onRemove(mediaId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove file.");
    } finally {
      setRemovingId(null);
    }
  }

  async function handleReorder(mediaId: string, nextOrder: string[]) {
    if (!onReorder) return;
    setReordering(mediaId);
    try {
      await onReorder(nextOrder);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reorder photos.");
    } finally {
      setReordering(null);
    }
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= gallery.length) return;
    const order = gallery.map((m) => m.media_id);
    [order[index], order[target]] = [order[target], order[index]];
    void handleReorder(gallery[index].media_id, order);
  }

  function setAsCover(mediaId: string) {
    const order = [mediaId, ...gallery.filter((m) => m.media_id !== mediaId).map((m) => m.media_id)];
    void handleReorder(mediaId, order);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="mb-1.5 flex items-center gap-2">
          <Input
            type="file"
            accept={MEDIA_ACCEPT}
            multiple
            onChange={(e) => void handleFiles(e.target.files)}
            disabled={uploading}
          />
          {uploading ? <Loader2 className="size-4 shrink-0 animate-spin text-ink-muted" /> : null}
        </div>
        <p className="mb-3 text-xs text-ink-faint">
          Images up to 6MB, videos up to 40MB.
          {onReorder ? " Use the star to set the cover photo, and the arrows to reposition." : ""}
        </p>
        {gallery.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong py-8 text-center text-ink-muted">
            <ImagePlus className="size-6" />
            <p className="text-sm">No photos or videos yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {gallery.map((media, index) => {
              const isCover = media.media_type === "image" && (coverUrl ? coverUrl === media.url : index === 0);
              const isBusy = reordering === media.media_id;
              return (
                <div
                  key={media.media_id}
                  className="relative aspect-square overflow-hidden rounded-lg border border-line bg-paper"
                >
                  {media.media_type === "video" ? (
                    <video src={media.url} className="h-full w-full object-cover" controls />
                  ) : (
                    <img src={media.url} alt={media.name} className="h-full w-full object-cover" />
                  )}
                  {isCover ? (
                    <span className="absolute bottom-1 left-1 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] text-white">
                      Cover
                    </span>
                  ) : null}
                  <div className="absolute right-1 top-1 flex gap-1">
                    {onReorder && media.media_type === "image" && !isCover ? (
                      <button
                        type="button"
                        title="Set as cover photo"
                        className="rounded bg-paper/90 p-1 text-forest disabled:opacity-50"
                        disabled={isBusy}
                        onClick={() => setAsCover(media.media_id)}
                      >
                        {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Star className="size-3.5" />}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      title="Remove"
                      className="rounded bg-paper/90 p-1 text-clay disabled:opacity-50"
                      disabled={removingId === media.media_id}
                      onClick={() => void handleRemove(media.media_id)}
                    >
                      {removingId === media.media_id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </button>
                  </div>
                  {onReorder && gallery.length > 1 ? (
                    <div className="absolute bottom-1 right-1 flex gap-1">
                      <button
                        type="button"
                        title="Move earlier"
                        className="rounded bg-paper/90 p-1 text-ink disabled:opacity-30"
                        disabled={index === 0 || isBusy}
                        onClick={() => moveItem(index, -1)}
                      >
                        <ChevronLeft className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Move later"
                        className="rounded bg-paper/90 p-1 text-ink disabled:opacity-30"
                        disabled={index === gallery.length - 1 || isBusy}
                        onClick={() => moveItem(index, 1)}
                      >
                        <ChevronRight className="size-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
