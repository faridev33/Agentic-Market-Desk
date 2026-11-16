import type { AnalysisResult } from "../api";
import { fmtCompactMoney, fmtNumber, fmtPct, fmtSigned, sentimentTone } from "../format";
import { Badge, Card } from "./ui";

export function SentimentPanel({ analysis }: { analysis: AnalysisResult }) {
  const sentiment = analysis.sentiment;
  if (!sentiment) {
    return (
      <Card className="panel">
        <header className="panel-head">
          <div>
            <p className="eyebrow">Berita</p>
            <h2>Umpan sentimen</h2>
          </div>
        </header>
        <p className="callout">Tidak ada data sentimen pada analisis ini.</p>
      </Card>
    );
  }

  const tone = sentimentTone(
    sentiment.aggregateScore > 0.15
      ? "positive"
      : sentiment.aggregateScore < -0.15
        ? "negative"
        : "neutral",
  );

  return (
    <Card className="panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Berita</p>
          <h2>Umpan sentimen</h2>
        </div>
        <div className="panel-badges">
          <Badge tone={tone}>
            {sentiment.aggregateScore > 0.15
              ? "Positif"
              : sentiment.aggregateScore < -0.15
                ? "Negatif"
                : "Netral"}{" "}
            {fmtSigned(sentiment.aggregateScore, 2)}
          </Badge>
          <Badge tone="muted">{sentiment.llmUsed ? "LLM" : "Leksikon"}</Badge>
        </div>
      </header>

      <div className="sentiment-meta">
        <span>{sentiment.articles.length} artikel dalam 45 hari</span>
        <span>Cakupan 14 hari {fmtPct(sentiment.coverage * 100, 0)}</span>
      </div>

      {sentiment.articles.length === 0 ? (
        <p className="callout">Tidak ada berita relevan; agen sentimen abstain.</p>
      ) : (
        <ul className="news-list">
          {sentiment.articles.slice(0, 8).map((article) => (
            <li key={article.newsId} className={`news-item news-item--${article.label}`}>
              <span className="news-dot" aria-hidden="true" />
              <div className="news-body">
                <p className="news-title">{article.title}</p>
                <div className="news-meta">
                  <span>{new Date(article.publishedAt).toLocaleString("id-ID")}</span>
                  <span className={`signed signed--${article.score > 0.15 ? "up" : article.score < -0.15 ? "down" : "flat"}`}>
                    {fmtSigned(article.score, 2)}
                  </span>
                  {article.events.map((event) => (
                    <span key={event} className="tag">
                      {event.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="panel-foot">
        <span>Dampak rata-rata {fmtNumber(sentiment.aggregateScore, 3)}</span>
        <span>
          {sentiment.articles.filter((article) => article.source === "llm").length} artikel dinilai LLM
        </span>
      </footer>
    </Card>
  );
}

export function QualityPanel({ analysis }: { analysis: AnalysisResult }) {
  const quality = analysis.dataQuality;
  const facts = [
    { label: "Candle histori", value: fmtNumber(quality.historyCandles, 0) },
    {
      label: "Usia quote",
      value:
        quality.quoteAgeHours === null ? "—" : `${fmtNumber(quality.quoteAgeHours, 1)} jam`,
    },
    { label: "Fundamental", value: quality.hasFundamentals ? "Tersedia" : "Tidak" },
    { label: "Berita", value: fmtNumber(quality.newsItems, 0) },
    { label: "Makro", value: quality.macroAvailable ? "Tersedia" : "Tidak" },
    { label: "Durasi", value: `${fmtNumber(analysis.meta.durationMs, 0)} ms` },
  ];

  return (
    <Card className="panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Integritas</p>
          <h2>Kualitas data</h2>
        </div>
        <Badge tone={quality.degraded ? "warn" : "ok"} dot>
          {quality.degraded ? "Terdegradasi" : "Lengkap"}
        </Badge>
      </header>

      <dl className="quality-grid">
        {facts.map((fact) => (
          <div key={fact.label} className="kv">
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>

      {quality.issues.length > 0 ? (
        <ul className="warning-list">
          {quality.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : (
        <p className="callout callout--ok">Semua sumber data utama tersedia pada analisis ini.</p>
      )}

      <footer className="panel-foot">
        <span>{analysis.meta.dataProvider}</span>
        <span>LLM {analysis.meta.llmEnabled ? "aktif" : "nonaktif"}</span>
        {analysis.quote?.marketCap ? (
          <span>Kap. pasar {fmtCompactMoney(analysis.quote.marketCap)}</span>
        ) : null}
      </footer>
    </Card>
  );
}
