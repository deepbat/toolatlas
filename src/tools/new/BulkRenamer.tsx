import { useMemo, useState } from "react";
import { Button, Field, Input, Panel, Select } from "../../components/ui";
import { renamedFiles, type RenameRule } from "../../lib/new-tools";
import { readZip, zipBlob } from "../../lib/zip";
import { downloadBlob } from "../../lib/utils";
export default function BulkRenamer() {
  const [files, setFiles] = useState<{ name: string; data: Uint8Array }[]>([]),
    [rules, setRules] = useState<RenameRule[]>([
      { kind: "prefix", a: "renamed-", b: "" },
    ]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const names = useMemo(
    () =>
      renamedFiles(
        files.map((f) => f.name),
        rules,
      ),
    [files, rules],
  );
  const load = async (fs: File[]) => {
    try {
      setBusy(true);
      setError("");
      if (
        fs.reduce((n, f) => n + f.size, 0) > 50 * 1024 * 1024 ||
        fs.length > 1000
      )
        throw Error("Choose at most 1,000 files / 50 MB input.");
      const out: { name: string; data: Uint8Array }[] = [];
      let bytes = 0;
      for (const f of fs) {
        if (/\.zip$/i.test(f.name)) {
          const entries = await readZip(
            await f.arrayBuffer(),
            100 * 1024 * 1024,
            1000,
          );
          for (const [name, data] of entries) {
            out.push({ name, data });
            bytes += data.length;
          }
        } else {
          const data = new Uint8Array(await f.arrayBuffer());
          out.push({ name: f.name, data });
          bytes += data.length;
        }
        if (out.length > 1000 || bytes > 100 * 1024 * 1024)
          throw Error("Archive limit: 1,000 files / 100 MB expanded.");
      }
      setFiles(out);
    } catch (e) {
      setFiles([]);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const update = (i: number, v: Partial<RenameRule>) =>
    setRules(rules.map((r, j) => (j === i ? { ...r, ...v } : r)));
  return (
    <div className="space-y-4">
      <Panel
        title="Files to rename"
        description="Drop files or ZIP archives. Output is flattened to one folder; extensions are preserved. Nothing is uploaded."
      >
        <div
          className="border border-dashed border-line p-5"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void load([...e.dataTransfer.files]);
          }}
        >
          <Input
            aria-label="Choose files or ZIP"
            type="file"
            multiple
            onChange={(e) => void load([...(e.target.files || [])])}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Max 1,000 files, 50 MB input, 100 MB expanded. Unencrypted standard
          ZIP (store/deflate) only. ZIP output is stored without compression.
          Name collisions receive -2, -3, etc.
        </p>
      </Panel>
      <Panel
        title="Renaming rules"
        description="Applied from top to bottom, to the filename before its extension."
      >
        <div className="space-y-3">
          {rules.map((r, i) => (
            <div
              className="flex flex-wrap items-end gap-2 border border-line p-3"
              key={i}
            >
              <Field label={"Rule " + (i + 1)}>
                <Select
                  value={r.kind}
                  onChange={(e) =>
                    update(i, {
                      kind: e.target.value as RenameRule["kind"],
                      a: "",
                      b: "",
                    })
                  }
                >
                  <option value="replace">Find & replace</option>
                  <option value="prefix">Add prefix</option>
                  <option value="suffix">Add suffix</option>
                  <option value="case">Change case</option>
                  <option value="number">Sequential numbering</option>
                </Select>
              </Field>
              {r.kind === "case" ? (
                <Field label="Case style">
                  <Select
                    value={r.a}
                    onChange={(e) => update(i, { a: e.target.value })}
                  >
                    <option value="">Choose case</option>
                    <option>lowercase</option>
                    <option>kebab-case</option>
                    <option>snake_case</option>
                  </Select>
                </Field>
              ) : (
                <Field
                  label={
                    r.kind === "replace"
                      ? "Find"
                      : r.kind === "number"
                        ? "Start number"
                        : "Text"
                  }
                >
                  <Input
                    maxLength={100}
                    value={r.a}
                    onChange={(e) => update(i, { a: e.target.value })}
                  />
                </Field>
              )}
              {["replace", "number"].includes(r.kind) && (
                <Field
                  label={
                    r.kind === "replace" ? "Replace with" : "Number of digits"
                  }
                >
                  <Input
                    maxLength={100}
                    value={r.b}
                    onChange={(e) => update(i, { b: e.target.value })}
                  />
                </Field>
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={i === 0}
                onClick={() => {
                  const x = [...rules];
                  [x[i - 1], x[i]] = [x[i], x[i - 1]];
                  setRules(x);
                }}
              >
                Move up
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRules(rules.filter((_, j) => j !== i))}
              >
                Remove rule {i + 1}
              </Button>
            </div>
          ))}
        </div>
        <Button
          className="mt-3"
          variant="secondary"
          disabled={rules.length >= 10}
          onClick={() => setRules([...rules, { kind: "suffix", a: "", b: "" }])}
        >
          Add rule
        </Button>
      </Panel>
      <Panel title={`Preview · ${files.length} files`}>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th className="p-2">Before</th>
                <th className="p-2">After</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="break-all p-2">{f.name}</td>
                  <td className="break-all p-2 text-accent">{names[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          className="mt-4"
          disabled={!files.length || busy}
          onClick={() => {
            try {
              downloadBlob(
                "renamed-files.zip",
                zipBlob(files.map((f, i) => ({ ...f, name: names[i] }))),
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {busy ? "Reading files…" : "Download renamed ZIP"}
        </Button>
        {error && (
          <p role="alert" className="mt-3 text-danger">
            {error}
          </p>
        )}
      </Panel>
    </div>
  );
}
