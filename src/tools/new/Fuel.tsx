import { useState } from "react";
import {
  Button,
  CopyButton,
  Field,
  Grid,
  Input,
  Panel,
  Select,
  Toggle,
} from "../../components/ui";
import { fuel, type FuelInput } from "../../lib/new-tools";
function saved() {
  try {
    const v = JSON.parse(localStorage.getItem("toolatlas:vehicles") || "[]");
    return Array.isArray(v)
      ? v
          .filter(
            (p) =>
              typeof p.name === "string" &&
              typeof p.unit === "string" &&
              typeof p.efficiency === "number",
          )
          .slice(0, 10)
      : [];
  } catch {
    return [];
  }
}
export default function Fuel() {
  const [v, setV] = useState<FuelInput>({
      distance: 300,
      efficiency: 15,
      price: 100,
      people: 3,
      round: false,
      unit: "kml",
      tolls: 0,
      parking: 0,
      exclude: false,
    }),
    [vehicles, setVehicles] =
      useState<{ name: string; unit: string; efficiency: number }[]>(saved),
    [name, setName] = useState("My car"),
    [message, setMessage] = useState("");
  const unit = v.unit === "mpg" ? "miles" : "km",
    energy = v.unit === "ev" ? "kWh" : v.unit === "mpg" ? "US gallons" : "L";
  let result: ReturnType<typeof fuel> | null = null,
    error = "";
  try {
    result = fuel(v);
  } catch (e) {
    error = (e as Error).message;
  }
  const money = (n: number) =>
    n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const summary = result
    ? `${v.round ? "Round trip" : "One-way trip"}: ${result.distance} ${unit}\n${v.unit === "ev" ? "Energy" : "Fuel"} (${energy}): ${money(result.used)}\nEnergy cost: ${money(result.energy)}\nTolls: ${money(v.tolls)} · Parking: ${money(v.parking)}\nTotal cost: ${money(result.total)}\nPer person (${result.payers} sharing${v.exclude ? ", driver excluded" : ""}): ${money(result.each)}`
    : "";
  const update = (key: keyof FuelInput, value: number | string | boolean) =>
    setV({ ...v, [key]: value });
  return (
    <div className="space-y-4">
      <Panel title="Trip & vehicle">
        <Grid>
          <Field label="Trip type">
            <Select
              value={v.round ? "round" : "one"}
              onChange={(e) => update("round", e.target.value === "round")}
            >
              <option value="one">One-way</option>
              <option value="round">Round-trip (double distance)</option>
            </Select>
          </Field>
          <Field label="Units">
            <Select
              value={v.unit}
              onChange={(e) => {
                const unit = e.target.value;
                setV({
                  ...v,
                  unit,
                  efficiency:
                    unit === "kml"
                      ? 15
                      : unit === "l100"
                        ? 6.67
                        : unit === "mpg"
                          ? 35
                          : 16,
                });
              }}
            >
              <option value="kml">km & km/L</option>
              <option value="l100">km & L/100 km</option>
              <option value="mpg">Miles & MPG (US gallon)</option>
              <option value="ev">EV: km & kWh/100 km</option>
            </Select>
          </Field>
          {(
            [
              ["distance", `Trip distance (${unit})`],
              [
                "efficiency",
                v.unit === "kml"
                  ? "Fuel efficiency (km/L)"
                  : v.unit === "l100"
                    ? "Fuel consumption (L/100 km)"
                    : v.unit === "mpg"
                      ? "Efficiency (miles/US gallon)"
                      : "Energy use (kWh/100 km)",
              ],
              ["price", `Price per ${energy}`],
              ["people", "People sharing (including driver)"],
              ["tolls", "Tolls"],
              ["parking", "Parking"],
            ] as [keyof FuelInput, string][]
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                type="number"
                step="any"
                aria-label={label}
                value={Number.isFinite(v[key]) ? (v[key] as number) : ""}
                onChange={(e) =>
                  update(
                    key,
                    e.target.value === "" ? NaN : Number(e.target.value),
                  )
                }
              />
            </Field>
          ))}
        </Grid>
        <div className="mt-4">
          <Toggle
            label="Exclude driver from split"
            checked={v.exclude}
            onChange={(x) => update("exclude", x)}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Enter one-way distance. Round-trip doubles distance and energy, not
          tolls/parking. Enter those as trip totals. All costs use the same
          currency you enter. Changing units resets efficiency to an example;
          enter your vehicle's measured value. MPG uses US, not Imperial
          gallons.
        </p>
        <Button
          className="mt-4"
          onClick={() => {
            if (!result) return;
            setMessage("Result updated.");
          }}
        >
          Run tool
        </Button>
      </Panel>
      <Panel title="Saved vehicles">
        <Grid>
          <Field label="Save vehicle name">
            <Input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Saved vehicle preset">
            <Select
              defaultValue=""
              onChange={(e) => {
                const p = vehicles[Number(e.target.value)];
                if (p) setV({ ...v, unit: p.unit, efficiency: p.efficiency });
              }}
            >
              <option value="">Choose vehicle…</option>
              {vehicles.map((p, i) => (
                <option key={i} value={i}>
                  {p.name} · {p.efficiency} {p.unit}
                </option>
              ))}
            </Select>
          </Field>
        </Grid>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!name.trim() || !result}
            onClick={() => {
              const next = [
                { name: name.trim(), unit: v.unit, efficiency: v.efficiency },
                ...vehicles.filter((p) => p.name !== name.trim()),
              ].slice(0, 10);
              setVehicles(next);
              try {
                localStorage.setItem(
                  "toolatlas:vehicles",
                  JSON.stringify(next),
                );
                setMessage("Vehicle saved in this browser.");
              } catch {
                setMessage(
                  "Storage is blocked. This preset is available only until you leave.",
                );
              }
            }}
          >
            Save Vehicle
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setVehicles([]);
              try {
                localStorage.removeItem("toolatlas:vehicles");
              } catch {}
              setMessage("Saved vehicles cleared.");
            }}
          >
            Clear vehicles
          </Button>
        </div>
      </Panel>
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : (
        <Panel
          title="Result"
          actions={<CopyButton value={summary} label="Copy Summary" />}
        >
          <pre
            data-testid="utility-result"
            className="whitespace-pre-wrap text-sm"
          >
            {summary}
          </pre>
        </Panel>
      )}
      {message && (
        <p role="status" className="text-xs text-accent">
          {message}
        </p>
      )}
      <p className="text-xs text-muted">
        Estimate only. Does not include maintenance, traffic, charging losses or
        route elevation. Check actual efficiency and current local prices.
      </p>
    </div>
  );
}
