import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { copyText } from "../lib/utils";
import { TOOL_MAP } from "../lib/catalog";
import { glyphFor } from "../lib/glyphs";
import {
  matchingTools,
  storeTransfer,
  readTransfer,
  clearTransfer,
  nativeValue,
} from "../lib/platform";
import { Button, Note, Select } from "./ui";
export function PersonalStrip() {
  const { favorites, recents, toggleFavorite, clearRecents } = useApp();
  const pins = favorites.filter((id) => TOOL_MAP[id]),
    recent = recents
      .filter((r) => TOOL_MAP[r.id] && !pins.includes(r.id))
      .slice(0, 6);
  if (!pins.length && !recent.length) return null;
  return (
    <section
      aria-label="Pinned and recent tools"
      className="mb-3 border border-line bg-raised/40 px-3 py-2"
    >
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <h2 className="label text-accent">Pinned & recent</h2>
        <button className="text-muted underline" onClick={clearRecents}>
          Clear history
        </button>
      </div>
      <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
        {pins.slice(0, 6).map((id) => (
          <span
            key={id}
            className="flex shrink-0 items-center border border-line text-[11px]"
          >
            <Link className="px-2 py-1" to={"/tools/" + id}>
              ★ {glyphFor(TOOL_MAP[id])} {TOOL_MAP[id].name}
            </Link>
            <button
              aria-label={"Unpin " + TOOL_MAP[id].name}
              onClick={() => toggleFavorite(id)}
              className="px-2 py-1 text-muted"
            >
              ×
            </button>
          </span>
        ))}
        {recent.map(({ id }) => (
          <Link
            key={id}
            className="shrink-0 border border-line px-2 py-1 text-[11px] text-muted"
            to={"/tools/" + id}
          >
            {glyphFor(TOOL_MAP[id])} {TOOL_MAP[id].name}
          </Link>
        ))}
      </div>
    </section>
  );
}
export function FileDrop() {
  const [file, setFile] = useState<File | null>(null),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const choose = (f?: File) => {
    setFile(f || null);
    setErr(
      f && !matchingTools(f).length
        ? "No compatible tools for this type. Try PDF, image, audio, video, JSON, CSV or TXT."
        : "",
    );
  };
  return (
    <section
      aria-label="Find tools for a file"
      className="mt-3 border border-dashed border-line bg-surface/60 px-3 py-2 text-xs"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        choose(e.dataTransfer.files[0]);
      }}
    >
      <label className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <span>
          <strong className="text-accent">Drop a file to find its tools</strong>
          <span className="ml-2 text-muted">No uploads.</span>
        </span>
        <input
          aria-label="Choose a file to find tools"
          type="file"
          className="max-w-full text-[10px]"
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </label>
      {file && (
        <div className="mt-3">
          <p className="break-all text-muted">
            {file.name} · {(file.size / 1024).toFixed(1)} KB{" "}
            <button className="ml-2 underline" onClick={() => choose()}>
              Clear
            </button>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {matchingTools(file).map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  try {
                    setBusy(true);
                    const token = await storeTransfer(t.id, file);
                    nav(`/tools/${t.id}/?handoff=${token}`);
                  } catch (e) {
                    setErr((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t.name} ↗
              </Button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted">
            Transfers stay on this device, are cleared after use and expire
            after 10 minutes. If local storage is blocked, keep this tab open.
          </p>
        </div>
      )}
      {err && (
        <p role="alert" className="mt-2 text-danger">
          {err}
        </p>
      )}
    </section>
  );
}
export function WorkspaceBridge({ id }: { id: string }) {
  const root = useRef<HTMLDivElement>(null),
    [status, setStatus] = useState(""),
    [output, setOutput] = useState<File | null>(null),
    [target, setTarget] = useState("");
  const nav = useNavigate(),
    loc = useLocation();
  useEffect(() => {
    setOutput(null);
    setTarget("");
    setStatus("");
    const token = new URLSearchParams(loc.search).get("handoff");
    if (!token) return;
    let cancelled = false,
      observer: MutationObserver | undefined;
    const receive = async () => {
      const files = await readTransfer(token, id);
      if (cancelled) return;
      const file = files?.[0];
      if (!file) {
        setStatus(
          "This temporary file expired or is unavailable. Please choose it again.",
        );
        return;
      }
      const apply = () => {
        if (cancelled) return false;
        const input = document.querySelector<HTMLInputElement>(
          "[data-workspace] input[type=file]",
        );
        if (input) {
          const dt = new DataTransfer();
          (files || []).forEach((f) => dt.items.add(f));
          input.files = dt.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (["json-formatter"].includes(id)) {
          const area = document.querySelector<HTMLTextAreaElement>(
            "[data-workspace] textarea",
          );
          if (!area) return false;
          if (file.size > 1000000) {
            setStatus(
              "Text handoffs support files under 1 MB. Please choose a smaller file.",
            );
            void clearTransfer(token);
            return true;
          }
          void file.text().then((t) => {
            if (!cancelled) nativeValue(area, t);
          });
        } else return false;
        void clearTransfer(token);
        const u = new URL(location.href);
        u.searchParams.delete("handoff");
        history.replaceState(null, "", u);
        setStatus(
          `Loaded ${file.name}. Check this tool's limits before processing.`,
        );
        return true;
      };
      if (!apply()) {
        observer = new MutationObserver(() => {
          if (apply()) observer?.disconnect();
        });
        observer.observe(
          document.querySelector("[data-workspace]") || document.body,
          { childList: true, subtree: true },
        );
      }
    };
    void receive().catch(() =>
      setStatus("Could not transfer the file. Please choose it again."),
    );
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [id, loc.search]);
  useEffect(() => {
    const onOutput = (e: Event) => setOutput((e as CustomEvent<File>).detail);
    const click = async (e: MouseEvent) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>("a[download]");
      if (a?.href.startsWith("blob:"))
        try {
          const b = await (await fetch(a.href)).blob();
          setOutput(new File([b], a.download || "result", { type: b.type }));
        } catch {
          /* unavailable output */
        }
    };
    window.addEventListener("toolatlas:output", onOutput);
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("toolatlas:output", onOutput);
      document.removeEventListener("click", click);
    };
  }, [id]);
  const targets = output
    ? matchingTools(output).filter((t) => t.id !== id)
    : [];
  return (
    <div ref={root} className="space-y-3">
      {status && (
        <p role="status" className="border border-line p-3 text-xs text-accent">
          {status}
        </p>
      )}
      {output && targets.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 border border-line bg-raised p-3"
          aria-label="Continue with output"
        >
          <span className="text-xs">Continue with {output.name}</span>
          <Select
            aria-label="Send output to"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Choose next tool…</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Button
            disabled={!target}
            size="sm"
            onClick={async () => {
              try {
                const token = await storeTransfer(target, output);
                nav(`/tools/${target}/?handoff=${token}`);
              } catch (e) {
                setStatus((e as Error).message);
              }
            }}
          >
            Send output to…
          </Button>
        </div>
      )}
    </div>
  );
}
export function ShareState({ id, enabled }: { id: string; enabled: boolean }) {
  const [sharing, setSharing] = useState(() =>
      location.hash.startsWith("#state="),
    ),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let observer: MutationObserver | undefined;
    const fields = () =>
      Array.from(
        document.querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >(
          "[data-workspace] input:not([type=file]):not([type=password]):not([type=hidden]),[data-workspace] textarea,[data-workspace] select",
        ),
      ).filter((e) => !e.disabled && e.type !== "button");
    const restore = () => {
      if (stop) return;
      const f = fields();
      if (!f.length) return false;
      try {
        if (location.hash.startsWith("#state=")) {
          const state = JSON.parse(decodeURIComponent(location.hash.slice(7)));
          if (Array.isArray(state) && state.length < 100) {
            f.forEach((el, i) => {
              const v = state[i];
              if (typeof v !== "string" || v.length > 8000) return;
              if (
                el instanceof HTMLInputElement &&
                (el.type === "checkbox" || el.type === "radio")
              ) {
                if (el.checked !== (v === "1")) el.click();
              } else nativeValue(el, v);
            });
            setSharing(true);
          }
        }
      } catch {
        setMessage("This saved link could not be read.");
      }
      return true;
    };
    if (!restore()) {
      observer = new MutationObserver(() => {
        if (restore()) observer?.disconnect();
      });
      observer.observe(
        document.querySelector("[data-workspace]") || document.body,
        { childList: true, subtree: true },
      );
    }
    return () => {
      stop = true;
      observer?.disconnect();
    };
  }, [id, enabled]);
  useEffect(() => {
    if (!enabled || !sharing) return;
    const sync = () => {
      const values = Array.from(
        document.querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >(
          "[data-workspace] input:not([type=file]):not([type=password]):not([type=hidden]),[data-workspace] textarea,[data-workspace] select",
        ),
      )
        .filter((e) => !e.disabled && e.type !== "button")
        .map((e) =>
          e instanceof HTMLInputElement &&
          (e.type === "checkbox" || e.type === "radio")
            ? e.checked
              ? "1"
              : "0"
            : e.value,
        );
      const encoded = encodeURIComponent(JSON.stringify(values));
      if (encoded.length > 16000) {
        setMessage("Inputs are too long to put in a link. Shorten them first.");
        return;
      }
      history.replaceState(
        null,
        "",
        location.pathname + location.search + "#state=" + encoded,
      );
    };
    const timer = setTimeout(sync, 200);
    document.addEventListener("input", sync);
    document.addEventListener("change", sync);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("input", sync);
      document.removeEventListener("change", sync);
    };
  }, [enabled, sharing, id]);
  if (!enabled) return null;
  return (
    <div className="my-3 space-y-2 text-xs">
      <label className="flex gap-2 text-muted">
        <input
          type="checkbox"
          checked={sharing}
          onChange={(e) => {
            setSharing(e.target.checked);
            if (!e.target.checked)
              history.replaceState(
                null,
                "",
                location.pathname + location.search,
              );
          }}
        />
        Keep inputs in shareable URL (visible to anyone with the link)
      </label>
      <Button
        size="sm"
        variant="secondary"
        onClick={async () => {
          if (!sharing) {
            setSharing(true);
            setMessage(
              "URL sharing enabled. Press Copy Shareable Link again after checking the inputs.",
            );
            return;
          }
          setMessage(
            (await copyText(location.href))
              ? "Shareable link copied."
              : "Could not copy. Copy the address bar instead.",
          );
        }}
      >
        Copy Shareable Link
      </Button>
      {message && <p role="status">{message}</p>}
      <p className="text-muted">
        Off by default so private text and financial details do not silently
        enter browser history. Files are never included.
      </p>
    </div>
  );
}
