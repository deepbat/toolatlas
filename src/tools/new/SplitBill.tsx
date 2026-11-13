import { useMemo, useState } from "react";
import {
  Button,
  CopyButton,
  Field,
  Input,
  Panel,
  Select,
} from "../../components/ui";
import { settle, type Expense } from "../../lib/new-tools";
export default function SplitBill() {
  const [names, setNames] = useState(["Deepak", "Rahul", "Amit"]),
    [expenses, setExpenses] = useState<Expense[]>([
      { label: "Fuel", amount: "1200", paidBy: 0, members: [0, 1, 2] },
      { label: "Lunch", amount: "600", paidBy: 1, members: [0, 1, 2] },
    ]),
    [currency, setCurrency] = useState("INR");
  const calc = useMemo(() => {
    try {
      return { r: settle(names.length, expenses), error: "" };
    } catch (e) {
      return { r: null, error: (e as Error).message };
    }
  }, [names.length, expenses]);
  const amount = (cents: number) => currency + " " + (cents / 100).toFixed(2);
  const labels = names.map(
    (n, i) => (n.trim() || "Person " + (i + 1)) + " (" + (i + 1) + ")",
  );
  const summary = calc.r
    ? `Group expenses\nTotal: ${amount(calc.r.total)}\n${calc.r.balances.map((v, i) => labels[i] + ": " + (v >= 0 ? "receives " : "owes ") + amount(Math.abs(v))).join("\n")}\n\nSettle with ${calc.r.transactions.length} payment(s):\n${calc.r.transactions.map((t) => labels[t.from] + " pays " + labels[t.to] + " " + amount(t.amount)).join("\n") || "Already settled."}`
    : "";
  const update = (i: number, x: Partial<Expense>) =>
    setExpenses(expenses.map((e, j) => (i === j ? { ...e, ...x } : e)));
  return (
    <div className="space-y-4">
      <Panel title="People & currency">
        <div className="grid gap-3 sm:grid-cols-3">
          {names.map((name, i) => (
            <Field key={i} label={"Person " + (i + 1)}>
              <Input
                maxLength={60}
                value={name}
                onChange={(e) =>
                  setNames(names.map((n, j) => (j === i ? e.target.value : n)))
                }
              />
            </Field>
          ))}
        </div>
        <div className="my-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={names.length >= 12}
            onClick={() => {
              setNames([...names, "Person " + (names.length + 1)]);
              setExpenses(
                expenses.map((e) => ({
                  ...e,
                  members: [...e.members, names.length],
                })),
              );
            }}
          >
            Add participant
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={names.length <= 2}
            onClick={() => {
              const last = names.length - 1;
              setNames(names.slice(0, -1));
              setExpenses(
                expenses.map((e) => ({
                  ...e,
                  paidBy: e.paidBy === last ? 0 : e.paidBy,
                  members: e.members.filter((m) => m !== last),
                })),
              );
            }}
          >
            Remove last participant
          </Button>
        </div>
        <Field label="Currency">
          <Select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {["INR", "USD", "EUR", "GBP", "CAD", "AUD"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </Panel>
      <Panel title="Expenses">
        {expenses.map((e, i) => (
          <div key={i} className="mb-4 border border-line p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={"Expense " + (i + 1)}>
                <Input
                  value={e.label}
                  maxLength={100}
                  onChange={(x) => update(i, { label: x.target.value })}
                />
              </Field>
              <Field label={"Amount " + (i + 1)}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={e.amount}
                  onChange={(x) => update(i, { amount: x.target.value })}
                />
              </Field>
              <Field label={"Paid by " + (i + 1)}>
                <Select
                  value={e.paidBy}
                  onChange={(x) =>
                    update(i, { paidBy: Number(x.target.value) })
                  }
                >
                  {labels.map((n, j) => (
                    <option value={j} key={j}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <fieldset className="mt-3">
              <legend className="mb-2 text-xs text-muted">
                Who participated in {e.label || "this expense"}?
              </legend>
              <div className="flex flex-wrap gap-3">
                {labels.map((n, j) => (
                  <label key={j} className="flex gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={e.members.includes(j)}
                      onChange={(x) =>
                        update(i, {
                          members: x.target.checked
                            ? [...e.members, j]
                            : e.members.filter((m) => m !== j),
                        })
                      }
                    />
                    {n}
                  </label>
                ))}
              </div>
            </fieldset>
            <Button
              className="mt-3"
              size="sm"
              variant="ghost"
              onClick={() => setExpenses(expenses.filter((_, j) => i !== j))}
            >
              Remove expense {i + 1}
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          disabled={expenses.length >= 100}
          onClick={() =>
            setExpenses([
              ...expenses,
              {
                label: "",
                amount: "0",
                paidBy: 0,
                members: names.map((_, i) => i),
              },
            ])
          }
        >
          Add expense
        </Button>
      </Panel>
      {calc.error ? (
        <p role="alert" className="text-danger">
          {calc.error}
        </p>
      ) : (
        <Panel
          title="Settlement"
          actions={
            <CopyButton value={summary} label="Copy Summary for WhatsApp" />
          }
        >
          <pre
            className="whitespace-pre-wrap break-words text-sm"
            data-testid="split-summary"
          >
            {summary}
          </pre>
          <p className="mt-4 text-xs text-muted">
            Exact minimum number of payments for up to 12 people, using integer
            cents. Shares are rounded fairly to cents; remainder cents go in
            participant order. No payments are sent. Names with the same text
            remain separate numbered people.
          </p>
        </Panel>
      )}
    </div>
  );
}
