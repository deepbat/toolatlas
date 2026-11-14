import { TOOL_MAP } from "./catalog";
export type FileKind =
  "pdf" | "image" | "audio" | "video" | "text" | "json" | "csv";
export const INPUTS: Record<FileKind, string[]> = {
  pdf: [
    "pdf-merge",
    "pdf-split",
    "pdf-compress",
    "pdf-to-images",
    "pdf-editor",
    "pdf-watermark",
    "pdf-page-organiser",
    "pdf-form-filler",
    "pvc-card-maker",
  ],
  image: [
    "image-compressor",
    "image-to-pdf",
    "image-bulk-convert",
    "image-bg-remove",
    "image-annotate",
    "image-upscale",
    "passport-photo",
    "signature-maker",
    "id-photo-maker",
    "remove-exif",
    "image-base64",
  ],
  audio: [
    "audio-trim",
    "audio-convert",
    "audio-merge",
    "audio-volume",
    "audio-reverse",
    "audio-size",
  ],
  video: [
    "video-trim",
    "video-compress",
    "video-mute",
    "video-frame",
    "video-audio",
  ],
  text: ["list-cleaner"],
  json: ["json-formatter"],
  csv: ["list-cleaner"],
};
export function fileKind(f: Pick<File, "name" | "type">): FileKind | null {
  const ext = f.name.split(".").pop()?.toLowerCase();
  if (f.type === "application/pdf" || ext === "pdf") return "pdf";
  if (
    /^(image\/)/.test(f.type) ||
    ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"].includes(ext || "")
  )
    return "image";
  if (
    f.type.startsWith("video/") ||
    ["mp4", "webm", "mov", "mkv"].includes(ext || "")
  )
    return "video";
  if (
    f.type.startsWith("audio/") ||
    ["mp3", "wav", "m4a", "ogg", "flac"].includes(ext || "")
  )
    return "audio";
  if (ext === "json") return "json";
  if (ext === "csv") return "csv";
  if (ext === "txt" || f.type.startsWith("text/")) return "text";
  return null;
}
export const matchingTools = (f: Pick<File, "name" | "type">) => {
  const k = fileKind(f);
  return k ? INPUTS[k].map((id) => TOOL_MAP[id]).filter(Boolean) : [];
};
const TTL = 10 * 60 * 1000;
let held: { token: string; to: string; files: File[]; at: number } | null =
  null;
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const q = indexedDB.open("toolatlas-handoffs", 1);
    q.onupgradeneeded = () => q.result.createObjectStore("files");
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(Error("Temporary file storage is unavailable."));
  });
}
export async function storeTransfer(
  to: string,
  input: File | File[],
): Promise<string> {
  const files = Array.isArray(input) ? input : [input];
  if (files.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024)
    throw Error(
      "Handoffs support files up to 100 MB. Open the tool and choose a smaller file.",
    );
  const token = crypto.randomUUID();
  held = { token, to, files, at: Date.now() };
  try {
    const d = await db();
    await new Promise<void>((ok, no) => {
      const tx = d.transaction("files", "readwrite");
      tx.objectStore("files").clear();
      tx.objectStore("files").put(held, token);
      tx.oncomplete = () => ok();
      tx.onerror = () => no(tx.error);
    });
    d.close();
  } catch {
    /* In-memory fallback works for same-tab navigation. */
  }
  setTimeout(() => void clearTransfer(token), TTL);
  return token;
}
export async function readTransfer(
  token: string,
  to: string,
): Promise<File[] | null> {
  let v = held;
  if (!v || v.token !== token) {
    try {
      const d = await db();
      v = await new Promise((ok, no) => {
        const q = d.transaction("files").objectStore("files").get(token);
        q.onsuccess = () => ok(q.result);
        q.onerror = () => no(q.error);
      });
      d.close();
    } catch {
      return null;
    }
  }
  if (!v || v.token !== token || v.to !== to || Date.now() - v.at > TTL) {
    await clearTransfer(token);
    return null;
  }
  return v.files;
}
export async function clearTransfer(token: string) {
  if (held?.token === token) held = null;
  try {
    const d = await db();
    await new Promise<void>((ok) => {
      const tx = d.transaction("files", "readwrite");
      tx.objectStore("files").delete(token);
      tx.oncomplete = () => ok();
      tx.onerror = () => ok();
    });
    d.close();
  } catch {
    /* optional storage */
  }
}
export function nativeValue(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const proto =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : input instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, value);
  input.dispatchEvent(
    new Event(input instanceof HTMLSelectElement ? "change" : "input", {
      bubbles: true,
    }),
  );
}

/** Remove expired local blobs on app start, including after a closed browser is reopened. */
export async function cleanupTransfers() {
  try {
    const d = await db();
    await new Promise<void>((ok) => {
      const tx = d.transaction("files", "readwrite"),
        q = tx.objectStore("files").openCursor();
      q.onsuccess = () => {
        const c = q.result;
        if (c) {
          if (!c.value || Date.now() - c.value.at > TTL) c.delete();
          c.continue();
        }
      };
      tx.oncomplete = () => ok();
      tx.onerror = () => ok();
    });
    d.close();
  } catch {}
}

export async function clearAllTransfers() {
  held = null;
  try {
    const d = await db();
    await new Promise<void>((ok, no) => {
      const tx = d.transaction("files", "readwrite");
      tx.objectStore("files").clear();
      tx.oncomplete = () => ok();
      tx.onerror = () => no(tx.error);
    });
    d.close();
  } catch {}
}
