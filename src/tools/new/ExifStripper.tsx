import { useState } from "react";
import { Button, Input, Note, Panel, Toggle } from "../../components/ui";
import { parseExif, stripJpeg, stripPng, type MetaTag } from "../../lib/exif";
import { zipBlob } from "../../lib/zip";
import { downloadBlob } from "../../lib/utils";
import { bitmap, blob, canvas } from "./helpers";
type Result = {
  name: string;
  blob: Blob;
  tags: MetaTag[];
  original: number;
  method: string;
};
export default function ExifStripper() {
  const [files, setFiles] = useState<File[]>([]),
    [lossless, setLossless] = useState(false),
    [results, setResults] = useState<Result[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const choose = (f: File[]) => {
    setFiles(f);
    setResults([]);
    setError("");
  };
  const run = async () => {
    setBusy(true);
    setError("");
    setResults([]);
    try {
      if (
        files.length > 30 ||
        files.reduce((n, f) => n + f.size, 0) > 50 * 1024 * 1024
      )
        throw Error("Choose at most 30 photos / 50 MB total.");
      const out: Result[] = [];
      for (const f of files) {
        if (
          !/\.(jpe?g|png|webp)$/i.test(f.name) &&
          !["image/jpeg", "image/png", "image/webp"].includes(f.type)
        )
          throw Error("Only JPG, PNG and WebP photos are supported.");
        const buf = await f.arrayBuffer(),
          meta = parseExif(buf);
        let b: Blob;
        let method = "Re-encoded, EXIF orientation applied by browser";
        const stripped =
          lossless && meta.kind === "jpeg"
            ? stripJpeg(buf)
            : meta.kind === "png"
              ? stripPng(buf)
              : null;
        if (stripped) {
          b = new Blob([stripped.bytes as BlobPart], {
            type: meta.kind === "png" ? "image/png" : "image/jpeg",
          });
          method =
            meta.kind === "png"
              ? "PNG metadata chunks removed without pixel changes"
              : "JPEG EXIF, XMP, IPTC and comments removed without re-encoding";
        } else {
          const img = await bitmap(f);
          const c = canvas(img.width, img.height);
          c.getContext("2d")!.drawImage(img, 0, 0);
          img.close();
          b = await blob(
            c,
            meta.kind === "webp"
              ? "image/webp"
              : meta.kind === "png"
                ? "image/png"
                : "image/jpeg",
            0.95,
          );
        }
        const ext =
          b.type === "image/png"
            ? "png"
            : b.type === "image/webp"
              ? "webp"
              : "jpg";
        out.push({
          name: f.name.replace(/\.[^.]*$/, "") + "-clean." + ext,
          blob: b,
          tags: meta.tags,
          original: f.size,
          method,
        });
      }
      setResults(out);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <Panel title="Photos to inspect and clean">
        <div
          className="border border-dashed border-line p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            choose([...e.dataTransfer.files]);
          }}
        >
          <Input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose photos"
            onChange={(e) => choose([...(e.target.files || [])])}
          />
        </div>
        <div className="my-4">
          <Toggle
            checked={lossless}
            label="Lossless JPEG stripping (may change displayed rotation)"
            onChange={(v) => {
              setLossless(v);
              setResults([]);
            }}
          />
        </div>
        <Note>
          Default JPEG/WebP cleanup re-encodes at high quality so the displayed
          orientation is preserved. Lossless JPEG removes EXIF/XMP/IPTC/comments
          but retains colour profiles and other APP segments. PNG removes text,
          time and EXIF without pixel changes. Do not use lossless mode if those
          retained profiles could be sensitive. Up to 30 images, 50 MB total;
          re-encoding supports 20 MB / 24 megapixels per image.
        </Note>
        <Button
          className="mt-4"
          disabled={!files.length || busy}
          onClick={() => void run()}
        >
          {busy ? "Cleaning locally…" : "Inspect & remove metadata"}
        </Button>
        {error && (
          <p role="alert" className="mt-3 text-danger">
            {error}
          </p>
        )}
      </Panel>
      {results.length > 0 && (
        <Panel
          title="Cleaned photos"
          actions={
            <Button
              onClick={async () =>
                downloadBlob(
                  "clean-photos.zip",
                  zipBlob(
                    await Promise.all(
                      results.map(async (r) => ({
                        name: r.name,
                        data: new Uint8Array(await r.blob.arrayBuffer()),
                      })),
                    ),
                  ),
                )
              }
            >
              Download all ZIP
            </Button>
          }
        >
          {results.map((r, i) => (
            <section key={i} className="mb-4 border border-line p-4">
              <h3 className="break-all text-sm font-semibold">{r.name}</h3>
              <p className="mt-2 text-xs text-muted">
                {r.method} · {(r.original / 1024).toFixed(1)} →{" "}
                {(r.blob.size / 1024).toFixed(1)} KB
              </p>
              <h4 className="mt-3 text-xs text-accent">
                Metadata found in original
              </h4>
              {r.tags.length ? (
                <dl className="my-2 space-y-1 text-xs">
                  {r.tags.map((t, j) => (
                    <div key={j} className="flex flex-wrap gap-2">
                      <dt
                        className={t.sensitive ? "text-danger" : "text-muted"}
                      >
                        {t.group} / {t.name}:
                      </dt>
                      <dd className="break-all">{t.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="my-2 text-xs text-muted">
                  No supported metadata tags found. This reader does not detect
                  every possible private marker.
                </p>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadBlob(r.name, r.blob)}
              >
                Download clean photo
              </Button>
            </section>
          ))}
          <p className="text-xs text-muted">
            Visible text, faces and image content are not removed. Verify
            sensitive photos before sharing.
          </p>
        </Panel>
      )}
    </div>
  );
}
