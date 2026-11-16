import { useEffect, useState } from "react";
import type {
  AnalyzeInput,
  AnalysisResult,
  AgentName,
  ApiError,
  Focus,
  HorizonAssessment,
  MacroSnapshot,
} from "../api";
import {
  AGENT_META,
  actionMeta,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
  fmtPct,
  fmtSigned,
  horizonLabel,
  isNumber,
  REGIME_META,
} from "../format";
import { AgentGrid } from "./AgentGrid";
import { CriticPanel } from "./CriticPanel";
import { MacroPanel } from "./MacroPanel";
import { RiskPanel } from "./RiskPanel";
import { QualityPanel, SentimentPanel } from "./SentimentQualityPanel";
import { LivePickChips } from "./TopPicksPanel";
import { useTopPicks } from "../useTopPicks";
import { QUICK_SYMBOLS } from "../market";
import { DataUpdatedAt } from "./DataUpdatedAt";
import { StockChart } from "./StockChart";
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  Meter,
  ScoreBar,
  Section,
  SkeletonBlock,
  Spinner,
} from "./ui";

const SUGGESTIONS = QUICK_SYMBOLS;

export const EIGHT_AGENTS_BREAKDOWN = [
  {
    id: "data_ingestion",
    number: "1",
    name: "Data Ingestion Agent",
    role: "Tarik & Validasi Data Pasar",
    badge: "Integritas Data",
    desc: "Mengambil data harga realtime, 956 emiten IDX, laporan keuangan 5 tahunan, makro, dan berita. Memvalidasi umur data, memfilter anomali nilai nol/suspensi, dan menormalisasi format laporan keuangan bank vs non-bank.",
    metrics: "Quote Age, History Candles, Financial Coverage, Anomaly Flags",
  },
  {
    id: "technical",
    number: "2",
    name: "Technical Agent",
    role: "Tren, Momentum & Volatilitas",
    badge: "Price Action",
    desc: "Mengevaluasi SMA 20, 50, 200, momentum RSI 14 (oversold/overbought), rentang volatilitas ATR, dan rasio volume 10 hari. Menentukan fase harga (uptrend/downtrend) serta menghitung level support & resistance.",
    metrics: "SMA 20/50/200, RSI 14, ATR Volatility, Volume Ratio",
  },
  {
    id: "fundamental",
    number: "3",
    name: "Fundamental Agent",
    role: "Kualitas Laba, Valuasi & Solvabilitas",
    badge: "Kesehatan Finansial",
    desc: "Menganalisis rasio profitabilitas (ROE & Net Margin), solvabilitas neraca (DER & kas vs utang), pertumbuhan laba/pendapatan YoY, serta valuasi P/E dan P/B relatif. Menyingkirkan emiten rugi dan utang tinggi.",
    metrics: "ROE %, Net Margin %, DER %, P/E, P/B, FCF Yield",
  },
  {
    id: "macro",
    number: "4",
    name: "Macro Agent",
    role: "Rezim Ekonomi & Siklus Pasar",
    badge: "Rezim Pasar",
    desc: "Membaca posisi IHSG terhadap SMA 50/200, indeks volatilitas global VIX, yield obligasi 10 tahun dan kurva yield spread, indeks Dolar AS (DXY), serta harga minyak dan emas untuk menentukan status: Risk-On, Neutral, atau Risk-Off.",
    metrics: "IHSG Trend, VIX, 10Y Yield, DXY, Risk-On / Risk-Off",
  },
  {
    id: "sentiment",
    number: "5",
    name: "News & Sentiment Agent",
    role: "Analisis Berita & Pengaruh Pasar",
    badge: "Poin 1–5 Berita",
    desc: "Memindai berita Yahoo Finance & Google News RSS IDX, mendeteksi peristiwa kunci (dividen, laba melonjak, akuisisi, restrukturisasi), memberi skor pengaruh 1-5 poin, serta menghitung sentimen bullish/bearish.",
    metrics: "Impact Score 1-5, Sentiment Score, Event Patterns",
  },
  {
    id: "synthesizer",
    number: "6",
    name: "Synthesizer Agent",
    role: "Penggabung Sinyal & Pembobot",
    badge: "Konsensus Multi-Agen",
    desc: "Menyatukan sinyal teknikal, fundamental, makro, dan sentimen dengan pembobotan adaptif sesuai horizon (Trading vs Investasi). Menghitung estimasi probabilitas kenaikan dan vonis aksi (Strong Buy, Buy, Hold, Reduce, Sell).",
    metrics: "Horizon Weights, Probability Up %, Combined Action",
  },
  {
    id: "critic",
    number: "7",
    name: "Critic / Validator Agent",
    role: "Red Team & Penguji Skeptis",
    badge: "Tantang Hipotesis",
    desc: "Berperan sebagai penguji independen yang mencari inkonsistensi (misal: harga naik tapi arus kas negatif, atau rekomendasi beli saat rezim makro Risk-Off). Memberikan vonis validasi: Pass, Caution, atau Reject.",
    metrics: "Contradiction Checks, Confidence Multiplier, Pass/Reject",
  },
  {
    id: "risk_manager",
    number: "8",
    name: "Risk Manager Agent",
    role: "Penjaga Modal & Ukuran Posisi",
    badge: "Proteksi Modal",
    desc: "Menghitung ukuran posisi (position sizing) berbasis volatilitas ATR dan Fractional Kelly Criterion, menentukan harga pasti Stop Loss dan Take Profit, serta memiliki Kill-Switch otomatis bila risiko melampaui batas toleransi.",
    metrics: "Position Sizing, Stop Loss, Take Profit, Kill-Switch",
  },
] as const;

const FOCUS_OPTIONS: { value: Focus; label: string }[] = [
  { value: "trading", label: "Trading" },
  { value: "investment", label: "Investasi" },
  { value: "both", label: "Keduanya" },
];

interface FormState {
  symbol: string;
  focus: Focus;
  equity: string;
  riskPerTradePct: string;
  currentDrawdownPct: string;
  sectorExposurePct: string;
  benchmark: string;
}

function parseNumber(value: string): number {
  const normalised = value.trim().replace(",", ".");
  if (normalised === "") return Number.NaN;
  return Number(normalised);
}

function isValidSymbol(value: string): boolean {
  return /^[A-Za-z0-9.^=_-]{1,24}$/.test(value);
}

function errorIssues(error: ApiError): string[] {
  if (!Array.isArray(error.details)) return [];
  return error.details
    .slice(0, 4)
    .map((entry) => {
      if (entry && typeof entry === "object" && "message" in entry) {
        return String((entry as { message: unknown }).message);
      }
      return String(entry);
    });
}

function ContributionRows({ assessment }: { assessment: HorizonAssessment }) {
  const entries: { agent: AgentName; value: number }[] = [];
  for (const [key, value] of Object.entries(assessment.contributions)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      entries.push({ agent: key as AgentName, value });
    }
  }
  if (entries.length === 0) return null;
  const maxAbs = Math.max(0.0001, ...entries.map((entry) => Math.abs(entry.value)));

  return (
    <ul className="contrib-list">
      {entries
        .sort((a, b) => b.value - a.value)
        .map((entry) => {
          const weight = assessment.weights[entry.agent] ?? 0;
          const width = (Math.abs(entry.value) / maxAbs) * 50;
          return (
            <li key={entry.agent}>
              <div className="contrib-top">
                <span>{AGENT_META[entry.agent]?.label ?? entry.agent}</span>
                <span className="contrib-weight">{fmtPct(weight * 100, 0)} bobot</span>
                <em className={`signed signed--${entry.value > 0 ? "up" : entry.value < 0 ? "down" : "flat"}`}>
                  {fmtSigned(entry.value, 3)}
                </em>
              </div>
              <div className="contrib-track" aria-hidden="true">
                <span className="contrib-axis" />
                <span
                  className={`contrib-fill ${entry.value >= 0 ? "is-positive" : "is-negative"}`}
                  style={
                    entry.value >= 0
                      ? { left: "50%", width: `${width}%` }
                      : { right: "50%", width: `${width}%` }
                  }
                />
              </div>
            </li>
          );
        })}
    </ul>
  );
}

function HorizonCard({
  assessment,
  primary,
}: {
  assessment: HorizonAssessment;
  primary: boolean;
}) {
  const meta = actionMeta(assessment.action);
  return (
    <Card className={`horizon-card ${primary ? "is-primary" : ""}`}>
      <header className="horizon-head">
        <div>
          <p className="eyebrow">Horizon</p>
          <h3>{horizonLabel(assessment.horizon)}</h3>
        </div>
        <div className="panel-badges">
          {primary ? <Badge tone="info">Utama</Badge> : null}
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
      </header>

      <div className="horizon-stats">
        <div>
          <span>Skor</span>
          <strong>{fmtSigned(assessment.score)}</strong>
        </div>
        <div>
          <span>Keyakinan</span>
          <strong>{fmtPct(assessment.confidence * 100, 0)}</strong>
        </div>
        <div>
          <span>Prob. naik*</span>
          <strong>{fmtPct(assessment.probabilityUp * 100, 0)}</strong>
        </div>
      </div>
      <ScoreBar score={assessment.score} />
      <ContributionRows assessment={assessment} />
    </Card>
  );
}

function RecommendationHero({ result }: { result: AnalysisResult }) {
  const rec = result.recommendation;
  const meta = actionMeta(rec.action);
  const regime = REGIME_META[result.regime] ?? { label: result.regime, tone: "muted" as const };
  const summary = result.fundamentalsSummary;

  return (
    <Card className="hero">
      <div className="hero-top">
        <div>
          <p className="eyebrow">Rekomendasi utama · horizon {horizonLabel(rec.horizon)}</p>
          <div className="hero-title-row">
            <span className={`action-chip action-chip--${meta.tone}`}>{meta.short}</span>
            <div>
              <h1>
                {result.symbol}
                {result.name ? <span className="hero-name">{result.name}</span> : null}
              </h1>
              <p className="hero-sub">
                {fmtDateTime(result.createdAt)} · {fmtNumber(result.meta.durationMs, 0)} ms ·{" "}
                {result.meta.dataProvider}
              </p>
            </div>
          </div>
        </div>
        <div className="hero-side">
          <Badge tone={regime.tone} dot>
            {regime.label}
          </Badge>
          {result.meta.degraded ? <Badge tone="warn">Data terdegradasi</Badge> : null}
        </div>
      </div>

      <div className="hero-stats">
        <div className="hero-stat">
          <span>Skor komposit</span>
          <strong>{fmtSigned(rec.score)}</strong>
          <ScoreBar score={rec.score} />
        </div>
        <div className="hero-stat">
          <span>Keyakinan</span>
          <strong>{fmtPct(rec.confidence * 100, 0)}</strong>
          <Meter value={rec.confidence} tone="info" />
        </div>
        <div className="hero-stat">
          <span>Probabilitas naik*</span>
          <strong>{fmtPct(rec.probabilityUp * 100, 0)}</strong>
          <Meter value={rec.probabilityUp} tone="buy" />
        </div>
      </div>

      {summary ? (
        <div className="fund-strip">
          <span className="tag">{summary.sector ?? "Sektor n/a"}</span>
          <span>P/E {fmtNumber(summary.trailingPE, 1)}</span>
          <span>P/B {fmtNumber(summary.priceToBook, 1)}</span>
          <span>ROE {fmtPct(summary.returnOnEquityPct, 1)}</span>
          <span>Growth {fmtPct(summary.revenueGrowthPct, 1, true)}</span>
          <span>D/E {fmtPct(summary.debtToEquityPct, 0)}</span>
        </div>
      ) : null}

      <div className="hero-body">
        <div>
          <h3>Tesis</h3>
          <ul className="thesis">
            {rec.thesis.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        {rec.conflicts.length > 0 ? (
          <div className="conflict-box">
            <h3>Konflik sinyal</h3>
            <ul>
              {rec.conflicts.map((conflict) => (
                <li key={conflict}>{conflict}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <p className="hero-foot">
        * Probabilitas adalah heuristik <code>{rec.calibration.replace(/_/g, " ")}</code> dan belum
        dikalibrasi terhadap hasil nyata. {result.meta.disclaimer}
      </p>
    </Card>
  );
}

function Results({ analysis }: { analysis: AnalysisResult }) {
  return (
    <div className="results-stack">
      <StockChart
        symbol={analysis.symbol}
        name={analysis.name}
        currentPrice={analysis.quote?.price}
        changePct={analysis.quote?.changePct}
      />

      <RecommendationHero result={analysis} />

      <Section eyebrow="Horizon" title="Satu sinyal, dua perspektif">
        <div className="horizon-grid">
          {analysis.horizons.map((assessment) => (
            <HorizonCard
              key={assessment.horizon}
              assessment={assessment}
              primary={assessment.horizon === analysis.recommendation.horizon}
            />
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Pipeline"
        title="Kontribusi tiap agen"
        aside={<span className="section-note">{analysis.agents.length} agen dijalankan paralel</span>}
      >
        <AgentGrid agents={analysis.agents} />
      </Section>

      <Section eyebrow="Kontrol" title="Risiko dan validasi">
        <div className="split-grid">
          <RiskPanel risk={analysis.risk} />
          <CriticPanel critic={analysis.critic} />
        </div>
      </Section>

      <Section eyebrow="Konteks" title="Sentimen dan integritas data">
        <div className="split-grid">
          <SentimentPanel analysis={analysis} />
          <QualityPanel analysis={analysis} />
        </div>
      </Section>
    </div>
  );
}

function EightAgentsSection() {
  return (
    <Section
      eyebrow="Arsitektur Multi-Agen"
      title="Struktur & Alur Analisis dari 8 Agen Otonom"
      aside={<span className="section-note">8 agen berkoordinasi dari hulu ke hilir</span>}
    >
      <div className="eight-agents-grid">
        {EIGHT_AGENTS_BREAKDOWN.map((agent) => (
          <Card key={agent.id} className="panel agent-breakdown-card">
            <div className="agent-breakdown-top">
              <span className="agent-num-badge">{agent.number}</span>
              <div className="agent-title-col">
                <h4 className="agent-breakdown-name">{agent.name}</h4>
                <span className="agent-breakdown-role">{agent.role}</span>
              </div>
              <Badge tone="info">{agent.badge}</Badge>
            </div>
            <p className="agent-breakdown-desc">{agent.desc}</p>
            <div className="agent-breakdown-metrics">
              <em>Metrik / Fokus Utama:</em> <span>{agent.metrics}</span>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}

export interface RunAnalysisPageProps {
  symbol: string;
  analysis: AnalysisResult | null;
  busy: boolean;
  error: ApiError | null;
  macro: MacroSnapshot | null;
  macroError: string | null;
  onSymbolChange: (symbol: string) => void;
  onAnalyze: (input: AnalyzeInput) => void;
  onReloadMacro: () => void;
}

export function RunAnalysisPage({
  symbol,
  analysis,
  busy,
  error,
  macro,
  macroError,
  onSymbolChange,
  onAnalyze,
  onReloadMacro,
}: RunAnalysisPageProps) {
  const [form, setForm] = useState<FormState>({
    symbol,
    focus: "both",
    equity: "100000000",
    riskPerTradePct: "",
    currentDrawdownPct: "0",
    sectorExposurePct: "0",
    benchmark: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const topPicks = useTopPicks();
  const equityPreview = parseNumber(form.equity);

  useEffect(() => {
    setForm((current) => (current.symbol === symbol ? current : { ...current, symbol }));
  }, [symbol]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function doSubmit() {
    const symbolValue = form.symbol.trim().toUpperCase();
    if (!isValidSymbol(symbolValue)) {
      setFormError("Simbol tidak valid. Gunakan huruf, angka, . ^ = _ -");
      return;
    }
    const equity = parseNumber(form.equity);
    if (!isNumber(equity) || equity <= 0 || equity > 1_000_000_000_000) {
      setFormError("Modal harus angka positif (maks 1 triliun).");
      return;
    }
    const drawdown = form.currentDrawdownPct.trim() === "" ? 0 : parseNumber(form.currentDrawdownPct);
    const sector = form.sectorExposurePct.trim() === "" ? 0 : parseNumber(form.sectorExposurePct);
    if (!isNumber(drawdown) || drawdown < 0 || drawdown > 100) {
      setFormError("Drawdown harus antara 0 dan 100%.");
      return;
    }
    if (!isNumber(sector) || sector < 0 || sector > 100) {
      setFormError("Eksposur sektor harus antara 0 dan 100%.");
      return;
    }
    const riskRaw = form.riskPerTradePct.trim();
    let risk: number | undefined;
    if (riskRaw !== "") {
      risk = parseNumber(riskRaw);
      if (!isNumber(risk) || risk < 0.05 || risk > 10) {
        setFormError("Risiko per transaksi harus antara 0,05% dan 10%.");
        return;
      }
    }
    const benchmarkRaw = form.benchmark.trim().toUpperCase();
    if (benchmarkRaw !== "" && !isValidSymbol(benchmarkRaw)) {
      setFormError("Benchmark tidak valid.");
      return;
    }

    setFormError(null);
    onSymbolChange(symbolValue);
    onAnalyze({
      symbol: symbolValue,
      focus: form.focus,
      equity,
      currentDrawdownPct: drawdown,
      sectorExposurePct: sector,
      ...(risk !== undefined ? { riskPerTradePct: risk } : {}),
      ...(benchmarkRaw !== "" ? { benchmark: benchmarkRaw } : {}),
    });
  }

  return (
    <div className="desk-layout">
      <aside className="desk-side">
        <Card className="panel form-panel">
          <header className="panel-head">
            <div>
              <p className="eyebrow">Input</p>
              <h2>Jalankan analisa</h2>
            </div>
            <div className="panel-badges">
              <Badge tone="info">Rupiah</Badge>
              <Badge tone="muted">8 tahap</Badge>
            </div>
          </header>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              doSubmit();
            }}
          >
            <div className="field">
              <label htmlFor="symbol">Simbol Emiten</label>
              <input
                id="symbol"
                value={form.symbol}
                onChange={(event) => update("symbol", event.target.value.toUpperCase())}
                placeholder="BBCA, SRTG, TAPG..."
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
              />

              <LivePickChips
                state={topPicks}
                currentSymbol={form.symbol}
                onPick={(sym) => update("symbol", sym)}
              />

              <div className="chips" style={{ marginTop: 6 }}>
                <span className="field-hint" style={{ marginRight: 4 }}>Saham Likuid:</span>
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className={`chip ${form.symbol === suggestion ? "is-active" : ""}`}
                    onClick={() => update("symbol", suggestion)}
                  >
                    {suggestion.replace(/\.JK$/, "")}
                  </button>
                ))}
              </div>
            </div>

            <fieldset className="field focus-field">
              <legend>Fokus horizon</legend>
              <div className="segmented" role="group" aria-label="Fokus horizon">
                {FOCUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={form.focus === option.value}
                    className={form.focus === option.value ? "is-active" : ""}
                    onClick={() => update("focus", option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="field-row">
              <div className="field">
                <label htmlFor="equity">Modal (Rp)</label>
                <input
                  id="equity"
                  value={form.equity}
                  onChange={(event) => update("equity", event.target.value)}
                  placeholder="100000000"
                  aria-describedby="equity-preview"
                  inputMode="decimal"
                />
                <span id="equity-preview" className="field-hint">
                  {isNumber(equityPreview) && equityPreview > 0
                    ? `Dipakai untuk position sizing: ${fmtMoney(equityPreview, "IDR", 0)}`
                    : "Masukkan nominal Rupiah tanpa titik, contoh 100000000."}
                </span>
              </div>
              <div className="field">
                <label htmlFor="risk">Risiko/transaksi (%)</label>
                <input
                  id="risk"
                  value={form.riskPerTradePct}
                  onChange={(event) => update("riskPerTradePct", event.target.value)}
                  placeholder="default 1"
                  inputMode="decimal"
                />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="drawdown">Drawdown saat ini (%)</label>
                <input
                  id="drawdown"
                  value={form.currentDrawdownPct}
                  onChange={(event) => update("currentDrawdownPct", event.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="field">
                <label htmlFor="sector">Eksposur sektor (%)</label>
                <input
                  id="sector"
                  value={form.sectorExposurePct}
                  onChange={(event) => update("sectorExposurePct", event.target.value)}
                  inputMode="decimal"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="benchmark">
                Benchmark <span className="label-optional">opsional</span>
              </label>
              <input
                id="benchmark"
                value={form.benchmark}
                onChange={(event) => update("benchmark", event.target.value.toUpperCase())}
                placeholder="^GSPC"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {formError ? (
              <p className="form-error" role="alert">
                {formError}
              </p>
            ) : null}

            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Menjalankan pipeline..." : "Jalankan analisa"}
            </button>
            <p className="form-note">
              Modal dalam Rupiah dan hanya dipakai untuk position sizing. Data ditarik langsung dari
              Yahoo Finance.
            </p>
          </form>
        </Card>

        <MacroPanel macro={macro} error={macroError} onRetry={onReloadMacro} />
      </aside>

      <div className="desk-main">
        <DataUpdatedAt
          timestamps={[
            { iso: analysis?.createdAt, label: "Analisis terakhir" },
            { iso: analysis?.quote?.fetchedAt, label: "Harga (quote)" },
            { iso: macro?.asOf, label: "Data makro" },
          ]}
        />

        {error ? (
          <ErrorBanner
            title="Analisis gagal"
            message={error.message}
            code={error.code}
            issues={errorIssues(error)}
            onRetry={doSubmit}
          />
        ) : null}

        {analysis && busy ? (
          <div className="busy-strip" role="status">
            <Spinner label="Analisis ulang berjalan; hasil sebelumnya tetap ditampilkan." />
          </div>
        ) : null}

        {analysis ? (
          <>
            <Results analysis={analysis} />
            <EightAgentsSection />
          </>
        ) : busy ? (
          <Card className="panel loading-panel">
            <Spinner label="Mengambil data dan menjalankan pipeline multi-agen..." />
            <SkeletonBlock lines={6} />
            <div className="pipeline-strip">
              <span>Data</span>
              <span>Teknikal</span>
              <span>Fundamental</span>
              <span>Makro</span>
              <span>Sentimen</span>
              <span>Sintesis</span>
              <span>Critic</span>
              <span>Risiko</span>
            </div>
          </Card>
        ) : (
          <div className="desk-initial-stack" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <StockChart symbol={form.symbol} height={340} />
            <Card className="panel">
              <EmptyState
                kicker="Analisa siap"
                title="Susun rekomendasi pertama"
                action={
                  <button type="button" className="btn btn-primary" onClick={doSubmit} disabled={busy}>
                    Analisis {form.symbol || "BBCA"} sekarang
                  </button>
                }
              >
                <p>
                  Delapan agen analitis membaca harga, fundamental, makro, dan berita secara paralel.
                  Synthesizer membobot sinyal sesuai horizon, Critic memvalidasi, lalu Risk Manager
                  menentukan ukuran posisi dan rencana keluar.
                </p>
                <p className="muted">
                  Hasil bersifat decision support. Probabilitas belum terkalibrasi dan bukan nasihat keuangan.
                </p>
              </EmptyState>
            </Card>
            <EightAgentsSection />
          </div>
        )}
      </div>
    </div>
  );
}
