import type { MediaType } from "./types";

export type StagedMedia = { name: string; dataUrl: string; media_type: MediaType };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/ogg"];
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

export const MEDIA_ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(",");
export const IMAGE_ACCEPT = IMAGE_TYPES.join(",");

/** Reads a FileList of images/videos into base64 data URLs, validating type and size. */
export async function readMediaFiles(files: FileList | null, limit = 10): Promise<StagedMedia[]> {
  if (!files?.length) return [];
  const selected = Array.from(files).slice(0, limit);
  return Promise.all(
    selected.map(
      (file) =>
        new Promise<StagedMedia>((resolve, reject) => {
          const isImage = IMAGE_TYPES.includes(file.type);
          const isVideo = VIDEO_TYPES.includes(file.type);
          if (!isImage && !isVideo) {
            reject(new Error(`${file.name} isn't a supported image or video type.`));
            return;
          }
          const max = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
          if (file.size > max) {
            reject(new Error(`${file.name} is larger than ${isImage ? "6MB" : "40MB"}.`));
            return;
          }
          const reader = new FileReader();
          reader.onload = () =>
            resolve({ name: file.name, dataUrl: String(reader.result), media_type: isImage ? "image" : "video" });
          reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
          reader.readAsDataURL(file);
        }),
    ),
  );
}

/** Reads a single image file for use as a profile/business avatar, validating type and size. */
export async function readAvatarFile(file: File): Promise<StagedMedia> {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new Error("Use a JPG, PNG, WEBP or GIF image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image is larger than 6MB.");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result), media_type: "image" });
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
