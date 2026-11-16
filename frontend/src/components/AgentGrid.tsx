import { useState } from "react";
import type { AgentRun } from "../api";
import {
  AGENT_META,
  fmtMetricValue,
  fmtNumber,
  fmtPct,
  fmtSigned,
  metricLabel,
  prioritisedMetricKeys,
} from "../format";
import { Badge, Card, Meter, ScoreBar } from "./ui";

const STATUS_META: Record<AgentRun["status"], { label: string; tone: "ok" | "warn" | "sell" }> = {
  ok: { label: "Aktif", tone: "ok" },
  degraded: { label: "Terbatas", tone: "warn" },
  failed: { label: "Gagal", tone: "sell" },
};

function AgentCard({ run }: { run: AgentRun }) {
  const [expanded, setExpanded] = useState(false);
  const meta = AGENT_META[run.agent] ?? { label: run.agent, blurb: "" };
  const status = STATUS_META[run.status];
  const signal = run.signal;
  const evidence = signal?.evidence ?? [];
  const visibleEvidence = expanded ? evidence : evidence.slice(0, 3);

  const preferred = prioritisedMetricKeys(run.agent);
  const metricKeys = signal
    ? preferred
        .filter((key) => signal.metrics[key] !== undefined && signal.metrics[key] !== null)
        .concat(Object.keys(signal.metrics).filter((key) => !preferred.includes(key)))
        .slice(0, 6)
    : [];

  return (
    <Card className={`agent-card agent-card--${run.status}`}>
      <header className="agent-head">
        <div>
          <h3>{meta.label}</h3>
          <p>{meta.blurb}</p>
        </div>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
      </header>

      {signal ? (
        <>
          <div className="agent-score">
            <div className="agent-score-value">
              <span className={`signed signed--${signal.score > 0.15 ? "up" : signal.score < -0.15 ? "down" : "flat"}`}>
                {fmtSigned(signal.score)}
              </span>
              <span className="agent-score-caption">skor sinyal</span>
            </div>
            <ScoreBar score={signal.score} />
            <div className="agent-confidence">
              <Meter value={signal.confidence} tone="info" />
              <span>{fmtPct(signal.confidence * 100, 0)} keyakinan</span>
            </div>
          </div>

          <p className="agent-summary">{signal.summary}</p>

          {visibleEvidence.length > 0 ? (
            <ul className="evidence-list">
              {visibleEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {evidence.length > 3 ? (
            <button
              type="button"
              className="link-button"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Sembunyikan bukti" : `Lihat semua bukti (${evidence.length})`}
            </button>
          ) : null}

          {metricKeys.length > 0 ? (
            <div className="metric-chips">
              {metricKeys.map((key) => (
                <span key={key} className="metric-chip">
                  <span>{metricLabel(key)}</span>
                  <strong>{fmtMetricValue(key, signal.metrics[key] ?? null)}</strong>
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="agent-error">{run.error ?? "Agen tidak menghasilkan sinyal."}</p>
      )}

      {run.warnings.length > 0 ? (
        <ul className="warning-list">
          {run.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <footer className="agent-foot">
        <span>{fmtNumber(run.durationMs, 0)} ms</span>
        {signal ? <span>as of {new Date(signal.asOf).toLocaleTimeString("id-ID")}</span> : null}
      </footer>
    </Card>
  );
}

export function AgentGrid({ agents }: { agents: AgentRun[] }) {
  return (
    <div className="agent-grid">
      {agents.map((run) => (
        <AgentCard key={run.agent} run={run} />
      ))}
    </div>
  );
}
