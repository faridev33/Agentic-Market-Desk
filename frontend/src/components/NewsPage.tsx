import { useCallback, useEffect, useMemo, useState } from "react";
import { api, toApiError } from "../api";
import type { NewsItem } from "../api";
import { relativeTime } from "../format";
import { NEWS_MARKET_SYMBOLS } from "../market";
import { Badge, Card, Section, SkeletonBlock } from "./ui";

const FALLBACK_NEWS_IMAGES = [
  "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1541354329998-f4d9a9f9297f?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80",
];

const SYMBOL_PATTERN = /^[A-Za-z0-9.^=_-]{1,24}$/;

interface FeedItem extends NewsItem {
  topic: string;
}

function scopeLabel(value: string): string {
  if (value === "") return "Pasar IDX";
  return value.replace(/\.JK$/, "");
}

type ImpactFilter = "all" | "top" | "critical" | "positive" | "negative";
type NewsSort = "impact" | "latest";
type ViewMode = "portal" | "list";

function fallbackForArticle(article: FeedItem, index = 0): string {
  if (article.imageUrl && article.imageUrl.trim() !== "") {
    return article.imageUrl;
  }
  const text = (article.title + " " + article.topic).toLowerCase();
  if (
    text.includes("bank") ||
    text.includes("bbca") ||
    text.includes("bbri") ||
    text.includes("bmri") ||
    text.includes("bbni") ||
    text.includes("bris") ||
    text.includes("kredit") ||
    text.includes("bunga") ||
    text.includes("bi rate")
  ) {
    return "https://images.unsplash.com/photo-1541354329998-f4d9a9f9297f?w=800&auto=format&fit=crop&q=80";
  }
  if (
    text.includes("emas") ||
    text.includes("antm") ||
    text.includes("mdka") ||
    text.includes("tambang") ||
    text.includes("inco") ||
    text.includes("nikel")
  ) {
    return "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=800&auto=format&fit=crop&q=80";
  }
  if (
    text.includes("adro") ||
    text.includes("ptba") ||
    text.includes("pgas") ||
    text.includes("aadi") ||
    text.includes("minyak") ||
    text.includes("energi") ||
    text.includes("batubara")
  ) {
    return "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=800&auto=format&fit=crop&q=80";
  }
  if (
    text.includes("tlkm") ||
    text.includes("isat") ||
    text.includes("excl") ||
    text.includes("goto") ||
    text.includes("digital") ||
    text.includes("telco") ||
    text.includes("tech")
  ) {
    return "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80";
  }
  if (text.includes("asii") || text.includes("untr") || text.includes("otomotif") || text.includes("mobil")) {
    return "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80";
  }
  if (
    text.includes("icbp") ||
    text.includes("indf") ||
    text.includes("cpin") ||
    text.includes("amrt") ||
    text.includes("unvr") ||
    text.includes("konsumsi") ||
    text.includes("ritel")
  ) {
    return "https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=800&auto=format&fit=crop&q=80";
  }
  return FALLBACK_NEWS_IMAGES[index % FALLBACK_NEWS_IMAGES.length]!;
}

function NewsHeroCard({
  article,
}: {
  article: FeedItem;
}) {
  const [imgSrc, setImgSrc] = useState(() => fallbackForArticle(article, 0));
  const score = article.impactScore ?? 2;

  useEffect(() => {
    setImgSrc(fallbackForArticle(article, 0));
  }, [article]);

  return (
    <article className="news-hero-card">
      <div className="news-hero-media">
        <img
          src={imgSrc}
          alt={article.title}
          className="news-hero-img"
          loading="eager"
          onError={() => setImgSrc(FALLBACK_NEWS_IMAGES[0]!)}
        />
        <div className="news-hero-badge-overlay">
          <span className="news-badge-breaking">★ BERITA UTAMA</span>
          <div className="news-overlay-bottom">
            <span className="news-badge-publisher">{article.publisher ?? "Warta Pasar"}</span>
            <span className={`news-badge-sentiment news-badge-sentiment--${article.sentiment ?? "neutral"}`}>
              {sentimentIcon(article.sentiment)} {sentimentText(article.sentiment)}
            </span>
          </div>
        </div>
      </div>
      <div className="news-hero-content">
        <div className="news-card-meta-line">
          <Badge tone={impactBadgeTone(score)}>⚡ Dampak {score}/5 · {impactLabel(score)}</Badge>
          <span className="news-meta-time">🕐 {relativeTime(article.publishedAt)}</span>
          <span className="news-meta-scope">{scopeLabel(article.topic)}</span>
        </div>
        <h2 className="news-hero-title">
          <a href={article.url || "#"} target="_blank" rel="noopener noreferrer">
            {article.title}
          </a>
        </h2>
        <p className="news-hero-snippet">
          {article.snippet || "Informasi pasar dan sentimen terkini terkait emiten Bursa Efek Indonesia."}
        </p>
        <div className="news-card-footer">
          <div className="news-card-tags">
            {article.relatedSymbols.slice(0, 3).map((sym) => (
              <span key={sym} className="tag tag-stock">
                {sym.replace(/\.JK$/, "")}
              </span>
            ))}
            {article.events?.map((ev) => (
              <span key={ev} className="tag tag-event">
                #{ev}
              </span>
            ))}
          </div>
          <a
            href={article.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="news-read-more-btn"
          >
            Baca di {article.publisher ?? "Situs Asli"} ↗
          </a>
        </div>
      </div>
    </article>
  );
}

function NewsGridCard({
  article,
  index,
}: {
  article: FeedItem;
  index: number;
}) {
  const [imgSrc, setImgSrc] = useState(() => fallbackForArticle(article, index));
  const score = article.impactScore ?? 2;

  useEffect(() => {
    setImgSrc(fallbackForArticle(article, index));
  }, [article, index]);

  return (
    <article className="news-grid-card">
      <div className="news-card-media">
        <img
          src={imgSrc}
          alt={article.title}
          className="news-card-img"
          loading="lazy"
          onError={() => setImgSrc(FALLBACK_NEWS_IMAGES[index % FALLBACK_NEWS_IMAGES.length]!)}
        />
        <div className="news-media-overlay">
          <span className="news-badge-publisher">{article.publisher ?? "Warta Pasar"}</span>
          <span className={`news-badge-sentiment news-badge-sentiment--${article.sentiment ?? "neutral"}`}>
            {sentimentIcon(article.sentiment)} {sentimentText(article.sentiment)}
          </span>
        </div>
      </div>
      <div className="news-card-body">
        <div className="news-card-meta-line">
          <Badge tone={impactBadgeTone(score)}>{score}/5 {impactLabel(score)}</Badge>
          <span className="news-meta-time">🕐 {relativeTime(article.publishedAt)}</span>
        </div>
        <h3 className="news-card-title">
          <a href={article.url || "#"} target="_blank" rel="noopener noreferrer">
            {article.title}
          </a>
        </h3>
        <p className="news-card-snippet">
          {article.snippet || article.title}
        </p>
        <div className="news-card-footer">
          <div className="news-card-tags">
            {article.relatedSymbols.slice(0, 3).map((sym) => (
              <span key={sym} className="tag tag-stock">
                {sym.replace(/\.JK$/, "")}
              </span>
            ))}
            {article.events?.slice(0, 1).map((ev) => (
              <span key={ev} className="tag tag-event">
                #{ev}
              </span>
            ))}
          </div>
          <a
            href={article.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="news-card-link-icon"
            title={`Buka di ${article.publisher ?? "sumber"}`}
            aria-label={`Buka di ${article.publisher ?? "sumber"}`}
          >
            ↗
          </a>
        </div>
      </div>
    </article>
  );
}

function impactBadgeTone(score: number): "buy" | "sell" | "warn" | "info" | "muted" {
  if (score >= 5) return "sell";
  if (score >= 4) return "warn";
  if (score >= 3) return "info";
  if (score >= 2) return "buy";
  return "muted";
}

function impactLabel(score: number): string {
  if (score >= 5) return "Kritis";
  if (score >= 4) return "Tinggi";
  if (score >= 3) return "Sedang";
  if (score >= 2) return "Rendah";
  return "Minimal";
}

function sentimentIcon(s?: string): string {
  if (s === "positive") return "▲";
  if (s === "negative") return "▼";
  return "●";
}

function sentimentTone(s?: string): "buy" | "sell" | "muted" {
  if (s === "positive") return "buy";
  if (s === "negative") return "sell";
  return "muted";
}

function sentimentText(s?: string): string {
  if (s === "positive") return "Positif";
  if (s === "negative") return "Negatif";
  return "Netral";
}

export function NewsPage({ onAnalyze }: { onAnalyze: (symbol: string) => void }) {
  const [selected, setSelected] = useState("");
  const [input, setInput] = useState("");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [totalSources, setTotalSources] = useState(0);

  const [impactFilter, setImpactFilter] = useState<ImpactFilter>("all");
  const [newsSort, setNewsSort] = useState<NewsSort>("latest");
  const [viewMode, setViewMode] = useState<ViewMode>("portal");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarnings([]);
    const symbols = selected === "" ? NEWS_MARKET_SYMBOLS : [selected];
    const results = await Promise.allSettled(symbols.map((symbol) => api.news(symbol, 16)));
    const byId = new Map<string, FeedItem>();
    const failed: string[] = [];

    results.forEach((result, index) => {
      const symbol = symbols[index] ?? "";
      if (result.status === "rejected") {
        failed.push(scopeLabel(symbol));
        return;
      }
      for (const article of result.value) {
        if (byId.has(article.id)) continue;
        byId.set(article.id, { ...article, topic: symbol });
      }
    });

    const feed = [...byId.values()]
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, 60);

    if (feed.length === 0 && failed.length === symbols.length) {
      const first = results.find((result) => result.status === "rejected");
      const reason =
        first && first.status === "rejected" ? toApiError(first.reason).message : "Berita tidak tersedia.";
      setError(reason);
    } else if (failed.length > 0) {
      setWarnings([`Sebagian sumber gagal dimuat: ${failed.join(", ")}.`]);
    }

    setItems(feed);
    setTotalSources(symbols.length);
    setUpdatedAt(new Date().toISOString());
    setLoading(false);
  }, [selected]);

  useEffect(() => {
    void load();
  }, [load]);

  const headline = useMemo(() => {
    if (selected !== "") return `Berita ${scopeLabel(selected)}`;
    return "Portal Berita Pasar & Emiten IDX";
  }, [selected]);

  /** ── Statistik Sentimen Hari Ini ── */
  const sentimentStats = useMemo(() => {
    const positive = items.filter((i) => i.sentiment === "positive").length;
    const negative = items.filter((i) => i.sentiment === "negative").length;
    const neutral  = items.filter((i) => i.sentiment !== "positive" && i.sentiment !== "negative").length;
    const total    = items.length;

    const score = total > 0 ? Math.round(((positive - negative) / total) * 100) : 0;

    const avgImpact = total > 0
      ? +(items.reduce((sum, i) => sum + (i.impactScore ?? 2), 0) / total).toFixed(1)
      : 0;

    let label: string;
    let tone: "bullish" | "bearish" | "mixed";
    if (score >= 30) {
      label = "Dominan Positif";
      tone = "bullish";
    } else if (score <= -30) {
      label = "Dominan Negatif";
      tone = "bearish";
    } else {
      label = "Campuran / Netral";
      tone = "mixed";
    }

    const posPct = total > 0 ? (positive / total) * 100 : 33.3;
    const negPct = total > 0 ? (negative / total) * 100 : 33.3;
    const neuPct = total > 0 ? (neutral / total) * 100 : 33.4;

    return { positive, negative, neutral, total, score, avgImpact, label, tone, posPct, negPct, neuPct };
  }, [items]);

  const displayedItems = useMemo(() => {
    let result = [...items];
    if (impactFilter === "top") {
      result = result.filter((i) => (i.impactScore ?? 2) >= 4);
    } else if (impactFilter === "critical") {
      result = result.filter((i) => (i.impactScore ?? 2) >= 5);
    } else if (impactFilter === "positive") {
      result = result.filter((i) => i.sentiment === "positive");
    } else if (impactFilter === "negative") {
      result = result.filter((i) => i.sentiment === "negative");
    }

    if (newsSort === "impact") {
      result.sort((a, b) => {
        const diff = (b.impactScore ?? 2) - (a.impactScore ?? 2);
        if (diff !== 0) return diff;
        return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
      });
    } else {
      result.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    }
    return result;
  }, [items, impactFilter, newsSort]);

  function submitSearch() {
    const value = input.trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(value)) {
      setError("Simbol tidak valid. Gunakan huruf, angka, . ^ = _ -");
      return;
    }
    setInput("");
    if (value === selected) {
      void load();
      return;
    }
    setSelected(value);
  }

  const heroArticle = displayedItems[0] ?? null;
  const gridArticles = displayedItems.slice(1);

  return (
    <div className="page-stack">
      <Section
        eyebrow="Portal Berita Finansial"
        title={headline}
        aside={
          <div className="news-actions">
            {selected !== "" ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onAnalyze(selected)}
              >
                Analisa {scopeLabel(selected)} ↗
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? "Memuat…" : "⟳ Segarkan"}
            </button>
          </div>
        }
      >
        {/* ── Sentimen Indikator ── */}
        {!loading && items.length > 0 && (
          <div className={`sentiment-indicator sentiment-indicator--${sentimentStats.tone}`}>
            <div className="sentiment-indicator-header">
              <div className="sentiment-indicator-title">
                <span className="sentiment-indicator-emoji" aria-hidden="true">
                  {sentimentStats.tone === "bullish" ? "🟢" : sentimentStats.tone === "bearish" ? "🔴" : "🟡"}
                </span>
                <strong className="sentiment-indicator-verdict">{sentimentStats.label}</strong>
              </div>
              <div className="sentiment-indicator-score">
                <span
                  className={`sentiment-score-value sentiment-score-value--${sentimentStats.score >= 0 ? "pos" : "neg"}`}
                >
                  {sentimentStats.score > 0 ? "+" : ""}
                  {sentimentStats.score}
                </span>
              </div>
            </div>

            <div
              className="sentiment-bar"
              title={`Positif ${sentimentStats.posPct.toFixed(0)}% · Netral ${sentimentStats.neuPct.toFixed(0)}% · Negatif ${sentimentStats.negPct.toFixed(0)}%`}
            >
              <div className="sentiment-bar-pos" style={{ width: `${sentimentStats.posPct}%` }} />
              <div className="sentiment-bar-neu" style={{ width: `${sentimentStats.neuPct}%` }} />
              <div className="sentiment-bar-neg" style={{ width: `${sentimentStats.negPct}%` }} />
            </div>

            <div className="sentiment-indicator-details">
              <div className="sentiment-stat sentiment-stat--pos">
                <span className="sentiment-stat-dot" />
                <span className="sentiment-stat-count">{sentimentStats.positive}</span>
                <span className="sentiment-stat-label">Positif ({sentimentStats.posPct.toFixed(0)}%)</span>
              </div>
              <div className="sentiment-stat sentiment-stat--neu">
                <span className="sentiment-stat-dot" />
                <span className="sentiment-stat-count">{sentimentStats.neutral}</span>
                <span className="sentiment-stat-label">Netral ({sentimentStats.neuPct.toFixed(0)}%)</span>
              </div>
              <div className="sentiment-stat sentiment-stat--neg">
                <span className="sentiment-stat-dot" />
                <span className="sentiment-stat-count">{sentimentStats.negative}</span>
                <span className="sentiment-stat-label">Negatif ({sentimentStats.negPct.toFixed(0)}%)</span>
              </div>
              <div className="sentiment-stat sentiment-stat--impact">
                <span className="sentiment-stat-icon">⚡</span>
                <span className="sentiment-stat-count">{sentimentStats.avgImpact}</span>
                <span className="sentiment-stat-label">Dampak</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Panel Berita ── */}
        <Card className="panel news-panel">
          {/* Toolbar Pencarian Berita */}
          <div className="news-toolbar">
            <div className="news-filter-status">
              {selected !== "" ? (
                <div className="news-active-filter">
                  <span className="news-filter-label">Filter aktif:</span>
                  <Badge tone="info">{scopeLabel(selected)}</Badge>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm news-clear-btn"
                    onClick={() => setSelected("")}
                    title="Kembali ke semua berita pasar"
                  >
                    ✕ Tampilkan Semua Berita
                  </button>
                </div>
              ) : (
                <span className="news-feed-headline-hint">
                  📰 Kabar terkini seputar pasar modal, IHSG, dan aksi korporasi emiten
                </span>
              )}
            </div>

            <form
              className="news-search"
              onSubmit={(event) => {
                event.preventDefault();
                submitSearch();
              }}
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value.toUpperCase())}
                placeholder="Cari simbol saham (mis. BBCA, ADRO)…"
                autoComplete="off"
                spellCheck={false}
                aria-label="Simbol berita"
              />
              <button type="submit" className="btn btn-ghost btn-sm">
                Cari
              </button>
            </form>
          </div>

          {/* Filter, Urutan & Tampilan */}
          <div className="news-filter-bar">
            <div className="chips news-impact-chips">
              <button
                type="button"
                className={`chip chip--compact ${impactFilter === "all" ? "is-active" : ""}`}
                onClick={() => setImpactFilter("all")}
              >
                Semua ({items.length})
              </button>
              <button
                type="button"
                className={`chip chip--compact ${impactFilter === "top" ? "is-active" : ""}`}
                onClick={() => setImpactFilter("top")}
                title="Impact 4–5"
              >
                🔥 Top
              </button>
              <button
                type="button"
                className={`chip chip--compact ${impactFilter === "critical" ? "is-active" : ""}`}
                onClick={() => setImpactFilter("critical")}
                title="Impact 5"
              >
                ⚡ Kritis
              </button>
              <button
                type="button"
                className={`chip chip--compact ${impactFilter === "positive" ? "is-active" : ""}`}
                onClick={() => setImpactFilter("positive")}
              >
                📈 Positif
              </button>
              <button
                type="button"
                className={`chip chip--compact ${impactFilter === "negative" ? "is-active" : ""}`}
                onClick={() => setImpactFilter("negative")}
              >
                📉 Negatif
              </button>
            </div>

            <div className="news-right-controls">
              <div className="news-view-toggle">
                <button
                  type="button"
                  className={`view-toggle-btn ${viewMode === "portal" ? "is-active" : ""}`}
                  onClick={() => setViewMode("portal")}
                  title="Tampilan Portal Web (Grid Gambar)"
                >
                  📰 Portal Web
                </button>
                <button
                  type="button"
                  className={`view-toggle-btn ${viewMode === "list" ? "is-active" : ""}`}
                  onClick={() => setViewMode("list")}
                  title="Tampilan Ringkas (List)"
                >
                  📋 Daftar
                </button>
              </div>

              <div className="news-sort-box">
                <select
                  id="news-sort-select"
                  value={newsSort}
                  onChange={(e) => setNewsSort(e.target.value as NewsSort)}
                  className="screener-select-mini"
                  aria-label="Urutan berita"
                >
                  <option value="latest">Terbaru</option>
                  <option value="impact">Dampak Tertinggi</option>
                </select>
              </div>
            </div>
          </div>

          {/* Ringkasan kecil */}
          <div className="news-summary">
            <span>
              {loading
                ? "Menarik berita terkini dari CNBC, Detik & Antara…"
                : `${displayedItems.length} berita dari ${totalSources} saluran finansial terverifikasi`}
            </span>
            <span>{updatedAt ? `Pembaruan: ${relativeTime(updatedAt)}` : "Live News Stream"}</span>
          </div>

          {warnings.map((warning) => (
            <p key={warning} className="inline-error">
              {warning}
            </p>
          ))}

          {error ? <p className="inline-error">{error}</p> : null}

          {loading && items.length === 0 ? (
            <div className="news-loading">
              <SkeletonBlock lines={12} />
            </div>
          ) : displayedItems.length === 0 ? (
            <p className="callout">
              Tidak ada berita cocok dengan filter ini. Coba ganti filter atau topik lain.
            </p>
          ) : viewMode === "portal" ? (
            /* ── TAMPILAN PORTAL BERITA (GRID GAMBAR & HERO SEPERTI WEB ASLI) ── */
            <div className="news-portal-container">
              {/* Berita Utama / Hero Card */}
              {heroArticle ? (
                <NewsHeroCard article={heroArticle} />
              ) : null}

              {/* Grid Berita Lainnya */}
              {gridArticles.length > 0 ? (
                <div className="news-portal-grid">
                  {gridArticles.map((article, idx) => (
                    <NewsGridCard
                      key={article.id}
                      article={article}
                      index={idx + 1}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            /* ── TAMPILAN LIST (DENGAN THUMBNAIL MINI) ── */
            <ul className="news-feed">
              {displayedItems.map((article, idx) => {
                const score = article.impactScore ?? 2;
                return (
                  <li key={article.id} className="news-feed-item news-feed-item--with-thumb">
                    <img
                      src={fallbackForArticle(article, idx)}
                      alt={article.title}
                      className="news-list-thumb"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = FALLBACK_NEWS_IMAGES[idx % FALLBACK_NEWS_IMAGES.length]!;
                      }}
                    />
                    <div className="news-list-body">
                      <div className="news-feed-meta">
                        <Badge tone="info">{scopeLabel(article.topic)}</Badge>
                        <Badge tone={impactBadgeTone(score)}>
                          {score}/5 {impactLabel(score)}
                        </Badge>
                        <Badge tone={sentimentTone(article.sentiment)}>
                          {sentimentIcon(article.sentiment)} {sentimentText(article.sentiment)}
                        </Badge>
                        <span className="news-feed-source">{article.publisher ?? "Yahoo Finance"}</span>
                        <time className="news-feed-time">{relativeTime(article.publishedAt)}</time>
                      </div>

                      <a
                        className="news-feed-title"
                        href={article.url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {article.title}
                      </a>

                      {article.snippet ? (
                        <p className="news-card-snippet">{article.snippet}</p>
                      ) : null}

                      <div className="news-feed-tags-row">
                        <div className="news-feed-tags">
                          {article.events?.map((ev) => (
                            <span key={ev} className="tag tag-event">
                              #{ev}
                            </span>
                          ))}
                          {article.relatedSymbols.slice(0, 4).map((symbol) => (
                            <span key={symbol} className="tag tag-stock">
                              {symbol.replace(/\.JK$/, "")}
                            </span>
                          ))}
                        </div>
                        <a
                          href={article.url || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="news-direct-link"
                        >
                          Buka berita ↗
                        </a>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <footer className="panel-foot">
            <span>
              Liputan Terkini: CNBC Indonesia, Detik Finance, Antara Finansial, Google News &amp; Yahoo Finance
            </span>
            <span>{selected === "" ? "Agregat pasar modal IDX" : `Filter ${selected}`}</span>
          </footer>
        </Card>
      </Section>
    </div>
  );
}
