import type { ReactNode } from "react";
import type { MacroSnapshot } from "../api";
import { fmtNumber, fmtPct, fmtSigned } from "../format";
import { Badge, Card, SkeletonBlock } from "./ui";

function Change({ value, digits = 2, unit = "%" }: { value: number | null; digits?: number; unit?: string }) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return <span className="macro-change is-flat">—</span>;
  }
  const tone = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const text = unit === "bps" ? `${fmtSigned(value, digits)} bps` : `${fmtSigned(value, digits)}%`;
  return <span className={`macro-change is-${tone}`}>{text}</span>;
}

function Row({
  label,
  value,
  change,
  hint,
}: {
  label: string;
  value: string;
  change?: ReactNode;
  hint?: string;
}) {
  return (
    <div className="macro-row">
      <div className="macro-row-label">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </div>
      <div className="macro-row-value">
        <strong>{value}</strong>
        {change}
      </div>
    </div>
  );
}

export function MacroPanel({
  macro,
  error,
  onRetry,
}: {
  macro: MacroSnapshot | null;
  error: string | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <Card className="panel macro-panel">
        <header className="panel-head">
          <div>
            <p className="eyebrow">Makro</p>
            <h2>Kondisi pasar</h2>
          </div>
        </header>
        <p className="inline-error">{error}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
          Muat ulang makro
        </button>
      </Card>
    );
  }

  if (!macro) {
    return (
      <Card className="panel macro-panel">
        <header className="panel-head">
          <div>
            <p className="eyebrow">Makro</p>
            <h2>Kondisi pasar</h2>
          </div>
        </header>
        <SkeletonBlock lines={6} />
      </Card>
    );
  }

  const riskTone = macro.vix !== null && macro.vix > 22 ? "sell" : "ok";
  const trendTone =
    macro.benchmarkAboveSma50 === true && macro.benchmarkAboveSma200 === true
      ? "buy"
      : macro.benchmarkAboveSma50 === false
        ? "sell"
        : "muted";

  return (
    <Card className="panel macro-panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Makro</p>
          <h2>Kondisi pasar</h2>
        </div>
        <div className="panel-badges">
          <Badge tone={riskTone} dot>
            {macro.vix === null ? "VIX n/a" : `VIX ${fmtNumber(macro.vix, 2)}`}
          </Badge>
          <Badge tone={trendTone}>
            {macro.benchmarkAboveSma50 === null
              ? macro.benchmarkSymbol
              : macro.benchmarkAboveSma50
                ? "Di atas SMA50"
                : "Di bawah SMA50"}
          </Badge>
        </div>
      </header>

      <div className="macro-rows">
        <Row
          label={macro.benchmarkSymbol}
          value={fmtNumber(macro.benchmarkPrice, 2)}
          change={<Change value={macro.benchmarkChange60dPct} />}
          hint="60 hari"
        />
        <Row
          label="VIX"
          value={fmtNumber(macro.vix, 2)}
          change={<Change value={macro.vixChange20dPct} />}
          hint="20 hari"
        />
        <Row
          label="Yield 10Y"
          value={`${fmtNumber(macro.tenYearYieldPct, 2)}%`}
          change={<Change value={macro.tenYearChange20dBps} unit="bps" />}
        />
        <Row label="Yield 3M" value={`${fmtNumber(macro.threeMonthYieldPct, 2)}%`} />
        <Row
          label="Spread kurva"
          value={`${fmtNumber(macro.yieldCurveSpreadPct, 2)}%`}
          hint="10Y − 3M"
        />
        <Row
          label="Dolar (DXY)"
          value={fmtNumber(macro.dollarIndex, 2)}
          change={<Change value={macro.dollarChange20dPct} />}
        />
        <Row label="Emas" value="—" change={<Change value={macro.goldChange20dPct} />} hint="20 hari" />
        <Row label="Minyak" value="—" change={<Change value={macro.oilChange20dPct} />} hint="20 hari" />
      </div>

      {macro.warnings.length > 0 ? (
        <ul className="warning-list">
          {macro.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <footer className="macro-foot">
        <span>Snapshot {new Date(macro.asOf).toLocaleString("id-ID")}</span>
        <span>{fmtPct(macro.benchmarkChange60dPct, 2, true)} dalam 60 hari</span>
      </footer>
    </Card>
  );
}
