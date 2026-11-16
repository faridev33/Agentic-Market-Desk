import type { CriticResult } from "../api";
import { checkTone, fmtPct, verdictMeta } from "../format";
import { Badge, Card } from "./ui";

export function CriticPanel({ critic }: { critic: CriticResult }) {
  const verdict = verdictMeta(critic.verdict);
  const failed = critic.checks.filter((check) => check.status === "fail").length;
  const warned = critic.checks.filter((check) => check.status === "warn").length;

  return (
    <Card className="panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Critic & validator</p>
          <h2>Pemeriksaan akhir</h2>
        </div>
        <Badge tone={verdict.tone} dot>
          {verdict.label}
        </Badge>
      </header>

      <div className="critic-summary">
        <div>
          <span className="stat-label">Pengali keyakinan</span>
          <strong>{fmtPct(critic.confidenceMultiplier * 100, 0)}</strong>
        </div>
        <div>
          <span className="stat-label">Pemeriksaan</span>
          <strong>
            {critic.checks.length} · {failed} gagal · {warned} peringatan
          </strong>
        </div>
        <div>
          <span className="stat-label">Metode</span>
          <strong>{critic.llmUsed ? "LLM + heuristik" : "Heuristik deterministik"}</strong>
        </div>
      </div>

      {critic.objections.length > 0 ? (
        <div className="objections">
          <h3>Keberatan</h3>
          <ul>
            {critic.objections.map((objection) => (
              <li key={objection}>{objection}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="check-list">
        {critic.checks.map((check) => (
          <li key={`${check.name}-${check.detail}`} className={`check check--${checkTone(check.status)}`}>
            <span className="check-dot" aria-hidden="true" />
            <div>
              <strong>{check.name.replace(/_/g, " ")}</strong>
              <p>{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
