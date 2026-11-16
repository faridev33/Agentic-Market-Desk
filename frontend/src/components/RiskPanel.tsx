import type { RiskAssessment } from "../api";
import { fmtMoney, fmtNumber, fmtPct } from "../format";
import { Badge, Card, KeyValue, Meter } from "./ui";

export function RiskPanel({ risk }: { risk: RiskAssessment }) {
  const sizing = risk.sizing;
  const limits = risk.limits;

  return (
    <Card className="panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Risk manager</p>
          <h2>Manajemen risiko</h2>
        </div>
        <div className="panel-badges">
          <Badge tone={risk.approved ? "ok" : "sell"} dot>
            {risk.approved ? "Disetujui" : "Ditolak"}
          </Badge>
          {risk.killSwitch.triggered ? <Badge tone="sell">Kill switch aktif</Badge> : null}
        </div>
      </header>

      {risk.killSwitch.triggered ? (
        <p className="callout callout--danger">
          {risk.killSwitch.reason ?? "Batas drawdown tercapai; eksekusi baru dihentikan."}
        </p>
      ) : null}

      <ul className="reason-list">
        {risk.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      {sizing ? (
        <div className="sizing-block">
          <div className="sizing-headline">
            <div>
              <span className="stat-label">Ukuran posisi disarankan</span>
              <strong>{fmtNumber(sizing.recommendedShares, 0)} saham</strong>
            </div>
            <div className="sizing-value">
              <span className="stat-label">Nilai posisi</span>
              <strong>{fmtMoney(sizing.recommendedPositionValue, "IDR", 2)}</strong>
              <span className="stat-hint">{fmtPct(sizing.recommendedPositionPct, 2)} dari portofolio</span>
            </div>
          </div>

          <div className="sizing-grid">
            <div className="mini-stat">
              <span>Risiko dana</span>
              <strong>{fmtMoney(sizing.riskAmount, "IDR", 2)}</strong>
            </div>
            <div className="mini-stat">
              <span>Maks. loss di stop</span>
              <strong>{fmtMoney(sizing.maxLossAtStop, "IDR", 2)}</strong>
            </div>
            <div className="mini-stat">
              <span>Stop loss</span>
              <strong>{fmtMoney(sizing.stopLoss, "IDR", 2)}</strong>
              <small>{fmtPct(sizing.stopDistancePct, 2)} dari harga</small>
            </div>
            <div className="mini-stat">
              <span>Take profit</span>
              <strong>{fmtMoney(sizing.takeProfit, "IDR", 2)}</strong>
              <small>target 2R</small>
            </div>
            <div className="mini-stat">
              <span>ATR</span>
              <strong>{fmtMoney(sizing.atr, "IDR", 2)}</strong>
              <small>{fmtPct(sizing.atrPct, 2)} dari harga</small>
            </div>
            <div className="mini-stat">
              <span>Kelly fraksional</span>
              <strong>{fmtPct(sizing.fractionalKellyPct, 2)}</strong>
              <small>posisi vol-target {fmtPct(sizing.volatilityTargetPct, 0)}</small>
            </div>
          </div>
        </div>
      ) : (
        <p className="callout">
          Tidak ada sizing posisi baru karena aksi utama bukan beli. Rencana keluar tetap
          ditampilkan sebagai referensi jika posisi sudah dipegang.
        </p>
      )}

      {risk.exitPlan ? (
        <div className="exit-plan">
          <div className="exit-plan-row">
            <span>Rencana keluar</span>
            <strong>
              Stop {fmtMoney(risk.exitPlan.stopLoss, "IDR", 2)} · Target{" "}
              {fmtMoney(risk.exitPlan.takeProfit, "IDR", 2)}
            </strong>
          </div>
          <p>{risk.exitPlan.note}</p>
        </div>
      ) : null}

      <div className="limits-block">
        <div className="limits-head">
          <span className="stat-label">Batas portofolio</span>
          <span className="stat-hint">dari konfigurasi server</span>
        </div>
        <dl className="limits-grid">
          <KeyValue label="Risiko/transaksi" value={fmtPct(limits.maxRiskPerTradePct, 2)} />
          <KeyValue label="Target volatilitas" value={fmtPct(limits.targetVolatilityPct, 0)} />
          <KeyValue label="Posisi maks." value={fmtPct(limits.maxPositionPct, 0)} />
          <KeyValue label="Drawdown maks." value={fmtPct(limits.maxDrawdownPct, 0)} />
          <KeyValue label="Eksposur sektor" value={fmtPct(limits.maxSectorExposurePct, 0)} />
        </dl>
      </div>

      {risk.warnings.length > 0 ? (
        <ul className="warning-list">
          {risk.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <div className="risk-gauge">
        <Meter
          value={risk.approved ? 1 : 0}
          tone={risk.approved ? "ok" : "sell"}
          label={risk.approved ? "Status: boleh dieksekusi sesuai batas" : "Status: eksekusi ditahan"}
        />
      </div>
    </Card>
  );
}
