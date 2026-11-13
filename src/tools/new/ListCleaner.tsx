import { useMemo, useState } from "react";
import {
  Button,
  CopyButton,
  Field,
  Input,
  Panel,
  Select,
  TextArea,
  Toggle,
} from "../../components/ui";
import { cleanList, type CleanOptions } from "../../lib/new-tools";
import { downloadText } from "../../lib/utils";
export default function ListCleaner() {
  const [text, setText] = useState(" apple\nbanana\nApple\n\nbanana"),
    [o, setO] = useState<CleanOptions>({
      trim: true,
      empty: true,
      dedupe: true,
      insensitive: true,
      sort: "none",
      emails: false,
      delimiter: "newline",
    }),
    [error, setError] = useState("");
  const r = useMemo(() => cleanList(text, o), [text, o]);
  return (
    <div className="space-y-4">
      <Panel title="Your list">
        <Field label="Import TXT or CSV">
          <Input
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 1e6) {
                setError("Use a text file under 1 MB.");
                return;
              }
              setText(await f.text());
              setError("");
            }}
          />
        </Field>
        <Field label="List input">
          <TextArea
            className="mt-3 min-h-48"
            value={text}
            maxLength={1000000}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <div className="my-4 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["trim", "Trim whitespace"],
              ["empty", "Remove empty lines"],
              ["dedupe", "Remove duplicate lines"],
              ["insensitive", "Ignore case for duplicates"],
              ["emails", "Extract emails only"],
            ] as const
          ).map(([k, label]) => (
            <Toggle
              key={k}
              label={label}
              checked={o[k]}
              onChange={(v) => setO({ ...o, [k]: v })}
            />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sort">
            <Select
              value={o.sort}
              onChange={(e) => setO({ ...o, sort: e.target.value })}
            >
              <option value="none">Keep original order</option>
              <option value="asc">A–Z</option>
              <option value="desc">Z–A</option>
            </Select>
          </Field>
          <Field label="Output delimiter">
            <Select
              value={o.delimiter}
              onChange={(e) => setO({ ...o, delimiter: e.target.value })}
            >
              <option value="newline">Newline</option>
              <option value="comma">Comma</option>
              <option value="semicolon">Semicolon</option>
            </Select>
          </Field>
        </div>
        <p className="mt-4 text-xs text-muted">
          CSV import treats each row as a line, not a column parser. Extract
          emails scans the whole text. Email matches are not validated or
          contacted.
        </p>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </Panel>
      <Panel title="Cleaned list" actions={<CopyButton value={r.output} />}>
        <p className="mb-3 text-sm" role="status">
          Original lines: {r.original} · Cleaned lines: {r.lines.length} ·
          Duplicates removed: {r.duplicates}
        </p>
        <pre
          data-testid="cleaned-list"
          className="max-h-80 overflow-auto whitespace-pre-wrap break-words border border-line p-4 text-sm"
        >
          {r.output}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => downloadText("cleaned-list.txt", r.output)}>
            Download TXT
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              downloadText(
                "cleaned-list.csv",
                r.lines
                  .map(
                    (l) =>
                      '"' +
                      (/^[=+@\-\t\r]/.test(l) ? "'" : "") +
                      l.replace(/"/g, '""') +
                      '"',
                  )
                  .join("\r\n"),
                "text/csv;charset=utf-8",
              )
            }
          >
            Download CSV
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted">
          CSV export uses one quoted column per item and neutralizes spreadsheet
          formula prefixes.
        </p>
      </Panel>
    </div>
  );
}
