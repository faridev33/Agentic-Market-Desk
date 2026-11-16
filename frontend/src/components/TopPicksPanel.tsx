import type { Tone } from "../format";
import { fmtDateTime, fmtMoney, fmtNumber, fmtPct } from "../format";
import type { TopPick } from "../api";
import type { TopPicksState } from "../useTopPicks";
import { Badge, Card, ErrorBanner, Section, Spinner } from "./ui";

const HORIZON_META: Record<TopPick["horizon"], { label: string; tone: Tone; note: string }> = {
  trading: { label: "Trading", tone: "info", note: "1–6 minggu" },
  investment: { label: "Investasi", tone: "ok", note: "3–12 bulan" },
};

function gradeTone(grade: string): Tone {
  if (grade === "A") return "buy";
  if (grade === "B") return "ok";
  if (grade === "C") return "warn";
  return "muted";
}

function signedTone(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "signed signed--flat";
  if (value > 0) return "signed signed--up";
  if (value < 0) return "signed signed--down";
  return "signed signed--flat";
}

function PickCard({
  pick,
  selected,
  onSelect,
  onAnalyze,
}: {
  pick: TopPick;
  selected: boolean;
  onSelect: () => void;
  onAnalyze: () => void;
}) {
  const horizon = HORIZON_META[pick.horizon];
  const fund = pick.fundamentals;
  const ind = pick.indicators;

  return (
    <Card className={`panel top5-ai-card ${selected ? "is-selected" : ""}`}>
      <div className="top5-card-top">
        <span className="top5-rank-badge">#{pick.rank}</span>
        <div className="top5-title-box">
          <h4 className="top5-code">{pick.code}</h4>
          <span className="top5-name">{pick.name ?? pick.symbol}</span>
        </div>
        <div className="top5-score-box">
          <Badge tone={gradeTone(pick.grade)}>Skor {fmtNumber(pick.consensusScore, 1)}</Badge>
          <small className="top5-grade">
            Grade {pick.grade} · {pick.voteCount}/8 agen
          </small>
        </div>
      </div>

      <div className="top5-horizon-row">
        <Badge tone={horizon.tone}>{horizon.label}</Badge>
        <span className="top5-horizon-note">{horizon.note}</span>
        <span className="top5-horizon-note">Kesepakatan {fmtPct(pick.agreementPct, 0)}</span>
        {pick.overextended ? <Badge tone="warn">Harga sudah melambung</Badge> : null}
      </div>

      <div className="top5-metrics-row">
        <div className="top5-metric">
          <span>Harga</span>
          <strong>{fmtMoney(pick.price, "IDR", 0)}</strong>
        </div>
        <div className="top5-metric">
          <span>Perubahan</span>
          <strong className={signedTone(pick.changePct)}>{fmtPct(pick.changePct, 2, true)}</strong>
        </div>
        <div className="top5-metric">
          <span>P/E</span>
          <strong>{fund?.trailingPE != null ? `${fmtNumber(fund.trailingPE, 1)}x` : "—"}</strong>
        </div>
        <div className="top5-metric">
          <span>ROE</span>
          <strong className="signed signed--up">
            {fund?.returnOnEquityPct != null ? fmtPct(fund.returnOnEquityPct, 1) : "—"}
          </strong>
        </div>
      </div>

      <div className="top5-plan-row">
        <div>
          <span>Entry</span>
          <strong>
            {fmtNumber(pick.plan.entryLow, 0)} – {fmtNumber(pick.plan.entryHigh, 0)}
          </strong>
        </div>
        <div>
          <span>Stop loss</span>
          <strong className="signed signed--down">{fmtNumber(pick.plan.stopLoss, 0)}</strong>
        </div>
        <div>
          <span>Target</span>
          <strong className="signed signed--up">{fmtNumber(pick.plan.target, 0)}</strong>
        </div>
        <div>
          <span>R:R</span>
          <strong>{fmtNumber(pick.plan.riskReward, 2)}x</strong>
        </div>
      </div>

      {typeof pick.plan.entryPullbackPct === "number" && pick.plan.entryPullbackPct < -1 ? (
        <p className="top5-entry-hint">
          Zona entry {fmtPct(Math.abs(pick.plan.entryPullbackPct), 1)} di bawah harga sekarang — tunggu
          pullback, jangan kejar.
        </p>
      ) : null}

      <div className="top5-indicator-row">
        <span>RSI {ind.rsi14 != null ? fmtNumber(ind.rsi14, 0) : "—"}</span>
        <span>MA20 {ind.fromSma20Pct != null ? fmtPct(ind.fromSma20Pct, 1, true) : "—"}</span>
        <span>1 bln {ind.return1mPct != null ? fmtPct(ind.return1mPct, 1, true) : "—"}</span>
        <span>3 bln {ind.return3mPct != null ? fmtPct(ind.return3mPct, 1, true) : "—"}</span>
        <span>Vol {ind.volatilityPct != null ? fmtPct(ind.volatilityPct, 0) : "—"}</span>
        <span>DD 1y {ind.drawdownPct != null ? fmtPct(ind.drawdownPct, 0) : "—"}</span>
        <span>Likuiditas {fmtNumber(ind.avgDailyValue / 1e9, 0)} M/hari</span>
      </div>

      {pick.overextended && pick.stretchReasons && pick.stretchReasons.length > 0 ? (
        <p className="top5-stretch">{pick.stretchReasons.join(" · ")}</p>
      ) : null}

      {pick.thesis.length > 0 ? (
        <ul className="top5-thesis">
          {pick.thesis.slice(0, 3).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {pick.risks.length > 0 ? (
        <p className="top5-risk">
          <strong>Risiko:</strong> {pick.risks[0]}
        </p>
      ) : null}

      <div className="top5-votes">
        {pick.votes.length === 0 ? (
          <span className="top5-vote top5-vote--empty">Tanpa suara agen · skor heuristik</span>
        ) : (
          pick.votes.map((vote) => (
            <span
              key={`${vote.agentId}-${vote.horizon}`}
              className="top5-vote"
              title={`${vote.reason}${vote.modelUsed ? ` (model: ${vote.modelUsed})` : ""}`}
            >
              {vote.agentName} <em>{vote.conviction}</em>
            </span>
          ))
        )}
      </div>

      <div className="top5-card-actions">
        <button
          type="button"
          className={`btn btn-sm ${selected ? "btn-primary" : "btn-ghost"}`}
          onClick={onSelect}
          title="Lihat grafik interaktif saham ini"
        >
          {selected ? "Sedang Dipilih" : "Lihat Grafik"}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={onAnalyze}
          title="Jalankan analisa 8 agen untuk saham ini"
        >
          Analisa 8 Agen ↗
        </button>
      </div>
    </Card>
  );
}

export function TopPicksSection({
  state,
  currentSymbol,
  onSelect,
  onAnalyze,
}: {
  state: TopPicksState;
  currentSymbol: string;
  onSelect: (symbol: string) => void;
  onAnalyze: (symbol: string) => void;
}) {
  const { result, progress, error, busy, refresh, run } = state;
  const running = progress?.status === "running";

  return (
    <Section
      eyebrow="Konsensus 8 Agen AI"
      title="5 Emiten Rekomendasi Beli"
      aside={
        <div className="panel-badges">
          {result ? <Badge tone="buy">{result.agentsOk}/8 agen aktif</Badge> : null}
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={run}
            disabled={busy || running}
            title="Pindai ulang seluruh universe IDX dengan 8 agen AI"
          >
            {running ? "Memindai..." : result ? "Pindai Ulang" : "Jalankan 8 AI"}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={refresh}
            disabled={running}
            title="Muat ulang snapshot terakhir"
          >
            Muat Ulang
          </button>
        </div>
      }
    >
      {error ? (
        <ErrorBanner message={error.message} code={error.code} onRetry={refresh} />
      ) : null}

      {running ? (
        <Card className="panel">
          <div className="top-picks-progress">
            <Spinner label={`${progress?.message ?? "Memproses..."}`} />
            <div className="screener-progress-track">
              <span style={{ width: `${Math.max(2, progress?.percent ?? 0)}%` }} />
            </div>
            <p className="field-hint">
              {fmtNumber(progress?.percent ?? 0, 1)}% · {progress?.processed ?? 0}/{progress?.total ?? 0} ·
              fase {progress?.phase ?? "-"} · {Math.round((progress?.elapsedMs ?? 0) / 1000)}s
            </p>
          </div>
        </Card>
      ) : null}

      {result ? (
        <>
          <div className="top-picks-meta">
            <span>
              <strong>{result.picks.length} emiten</strong> terpilih dari {result.universe.total} emiten IDX
            </span>
            <span>{result.universe.liquid} lolos filter likuiditas</span>
            <span>{result.universe.deepScanned} dianalisis teknikal</span>
            <span>{result.universe.shortlisted} finalis diserahkan ke agen</span>
            <span>{result.universe.extendedExcluded ?? 0} disisihkan karena harga melambung</span>
            <span>Dibuat {fmtDateTime(result.generatedAt)}</span>
            <span>Durasi {Math.round(result.durationMs / 1000)}s</span>
          </div>
          <p className="top-picks-regime">{result.regimeNote}</p>

          <div className="top5-ai-grid">
            {result.picks.map((pick) => (
              <PickCard
                key={`${pick.code}-${pick.horizon}`}
                pick={pick}
                selected={currentSymbol === pick.symbol}
                onSelect={() => onSelect(pick.symbol)}
                onAnalyze={() => onAnalyze(pick.symbol)}
              />
            ))}
          </div>

          <div className="top-picks-agents">
            {result.agentRuns.map((agent) => (
              <span
                key={agent.id}
                className={`top-picks-agent ${agent.status === "ok" ? "is-ok" : "is-failed"}`}
                title={agent.error ?? `Model ${agent.modelUsed ?? agent.model}`}
              >
                {agent.name}
                <em>
                  {agent.status === "ok"
                    ? `${agent.picks} pick · ${Math.round(agent.durationMs / 1000)}s`
                    : `gagal · ${(agent.error ?? "").slice(0, 40)}`}
                </em>
              </span>
            ))}
          </div>

          {result.notes.length > 0 ? (
            <ul className="top-picks-notes">
              {result.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}

          <p className="muted top-picks-disclaimer">{result.disclaimer}</p>
        </>
      ) : !running ? (
        <Card className="panel">
          <p className="field-hint">
            Belum ada snapshot. Tekan <strong>Jalankan 8 AI</strong> untuk memindai seluruh universe IDX
            (≈ 950 emiten), menyaring likuiditas, menghitung indikator teknikal, lalu meminta rekomendasi
            8 agen AI (3 posisi trading + 2 posisi investasi).
          </p>
        </Card>
      ) : null}
    </Section>
  );
}

export function LivePickChips({
  state,
  currentSymbol,
  onPick,
}: {
  state: TopPicksState;
  currentSymbol: string;
  onPick: (symbol: string) => void;
}) {
  const picks = state.result?.picks ?? [];
  if (picks.length === 0) return null;
  return (
    <div className="ai-picks-block" style={{ marginTop: 8 }}>
      <span className="field-hint" style={{ fontWeight: 600, color: "var(--info, #38bdf8)" }}>
        ⭐ 5 Emiten Pilihan 8 AI (live · {state.result?.agentsOk ?? 0}/8 agen):
      </span>
      <div className="chips" style={{ marginTop: 4 }}>
        {picks.map((pick) => (
          <button
            key={`${pick.code}-${pick.horizon}`}
            type="button"
            className={`chip ${currentSymbol === pick.symbol ? "is-active" : ""}`}
            onClick={() => onPick(pick.symbol)}
            title={`${pick.name ?? pick.code} · skor ${pick.consensusScore} · ${pick.thesis[0] ?? ""}`}
            style={{ borderLeft: "3px solid #10b981" }}
          >
            <strong>{pick.code}</strong> (Rp {pick.price.toLocaleString("id-ID")})
          </button>
        ))}
      </div>
    </div>
  );
}
