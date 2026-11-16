import YahooFinance from "yahoo-finance2";
import { scoreNewsImpact } from "../agents/sentimentLexicon.js";
import { AppError, errorMessage } from "../lib/errors.js";
import { pctChange } from "../lib/math.js";
import { sma } from "../lib/indicators.js";
import type {
  Candle,
  CompanyOfficer,
  CompanyOverview,
  CompanyProfile,
  FinancialPeriod,
  Fundamentals,
  MacroSnapshot,
  NewsItem,
  PriceSeries,
  Quote,
  ScreenerKeyStats,
} from "../types.js";
import { TtlCache } from "./cache.js";
import type {
  HistoryInterval,
  HistoryOptions,
  HistoryRange,
  MarketDataProviders,
} from "./types.js";

const DAY_MS = 86_400_000;

/**
 * yahoo-finance2 v4 memvalidasi respon Yahoo secara ketat.
 * Yahoo sering mengubah struktur respon sehingga validasi gagal
 * (FailedYahooValidationError / "failed yahoo schema validation").
 * Kita matikan validasi ketat karena kode kita sudah memvalidasi
 * setiap field secara manual melalui helper asNumber/asString/asIso.
 */
const NO_VALIDATE = { validateResult: false } as const;

const RANGE_DAYS: Record<HistoryRange, number | null> = {
  "1mo": 31,
  "3mo": 93,
  "6mo": 186,
  "1y": 366,
  "2y": 732,
  "3y": 1_097,
  "5y": 1_827,
  "10y": 3_653,
  max: null,
};

const TTL = {
  quoteMs: 30_000,
  historyMs: 5 * 60_000,
  fundamentalsMs: 6 * 60 * 60_000,
  newsMs: 5 * 60_000,
  macroMs: 10 * 60_000,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

/** Yahoo mengembalikan rasio sebagai pecahan (0.46) pada sebagian field. */
function fractionToPct(value: number | null): number | null {
  if (value === null) return null;
  return Math.abs(value) <= 5 ? value * 100 : value;
}

function growthPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function marginPct(part: number | null, base: number | null): number | null {
  if (part === null || base === null || base === 0) return null;
  return (part / base) * 100;
}

/** ^TNX / ^IRX kadang dikutip 10x (41.5 alih-alih 4.15). */
function normalizeYield(value: number): number {
  return value > 20 ? value / 10 : value;
}

function latest(values: readonly number[]): number | null {
  return values.length > 0 ? values[values.length - 1] : null;
}

function changePctAgo(values: readonly number[], bars: number): number | null {
  if (values.length <= bars) return null;
  return pctChange(values[values.length - 1 - bars], values[values.length - 1]);
}

function smaLast(values: readonly number[], period: number): number | null {
  if (values.length < period) return null;
  return latest(sma(values, period).filter((v): v is number => v !== null));
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'");
}

function cleanHtmlSnippet(raw: string): string {
  return decodeXmlEntities(raw)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getEditorialFallbackImage(title: string, symbol: string): string {
  const text = (title + " " + symbol).toLowerCase();
  if (
    text.includes("bbca") ||
    text.includes("bbri") ||
    text.includes("bmri") ||
    text.includes("bbni") ||
    text.includes("bris") ||
    text.includes("bank") ||
    text.includes("kredit") ||
    text.includes("bunga") ||
    text.includes("bi rate") ||
    text.includes("deposito") ||
    text.includes("finansial")
  ) {
    return "https://images.unsplash.com/photo-1541354329998-f4d9a9f9297f?w=800&auto=format&fit=crop&q=80";
  }
  if (
    text.includes("emas") ||
    text.includes("antm") ||
    text.includes("mdka") ||
    text.includes("inco") ||
    text.includes("nikel") ||
    text.includes("tambang") ||
    text.includes("mineral") ||
    text.includes("tembaga")
  ) {
    return "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=800&auto=format&fit=crop&q=80";
  }
  if (
    text.includes("adro") ||
    text.includes("ptba") ||
    text.includes("pgas") ||
    text.includes("aadi") ||
    text.includes("minyak") ||
    text.includes("oil") ||
    text.includes("gas") ||
    text.includes("energi") ||
    text.includes("batubara") ||
    text.includes("batu bara")
  ) {
    return "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=800&auto=format&fit=crop&q=80";
  }
  if (
    text.includes("tlkm") ||
    text.includes("isat") ||
    text.includes("excl") ||
    text.includes("goto") ||
    text.includes("emtk") ||
    text.includes("data center") ||
    text.includes("ai") ||
    text.includes("digital") ||
    text.includes("teknologi") ||
    text.includes("telco") ||
    text.includes("software")
  ) {
    return "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80";
  }
  if (
    text.includes("asii") ||
    text.includes("untr") ||
    text.includes("otomotif") ||
    text.includes("mobil") ||
    text.includes("motor") ||
    text.includes("ev ") ||
    text.includes("kendaraan")
  ) {
    return "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80";
  }
  if (
    text.includes("icbp") ||
    text.includes("indf") ||
    text.includes("cpin") ||
    text.includes("amrt") ||
    text.includes("unvr") ||
    text.includes("konsumsi") ||
    text.includes("ritel") ||
    text.includes("makanan") ||
    text.includes("belanja")
  ) {
    return "https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=800&auto=format&fit=crop&q=80";
  }
  if (
    text.includes("ihsg") ||
    text.includes("bursa") ||
    text.includes("saham") ||
    text.includes("investor") ||
    text.includes("ipo") ||
    text.includes("trading") ||
    text.includes("dividen")
  ) {
    return "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop&q=80";
  }
  return "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800&auto=format&fit=crop&q=80";
}

async function fetchIndonesianFeeds(targetSymbol: string, maxCount: number): Promise<NewsItem[]> {
  const feeds = [
    { name: "CNBC Indonesia", url: "https://www.cnbcindonesia.com/market/rss/" },
    { name: "Detik Finance", url: "https://finance.detik.com/bursa-dan-valas/rss" },
    { name: "Antara Finansial", url: "https://www.antaranews.com/rss/ekonomi-finansial.xml" },
  ];

  const cleanTarget = targetSymbol.replace(/\.JK$/i, "").replace(/^\^/, "").toUpperCase();
  const isMarket = !cleanTarget || cleanTarget === "JKSE" || cleanTarget === "IHSG";

  const results: (NewsItem & { priority: number })[] = [];

  await Promise.allSettled(
    feeds.map(async (feed) => {
      try {
        const response = await fetch(feed.url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept: "application/rss+xml, application/xml, text/xml, */*",
          },
          signal: AbortSignal.timeout(6000),
        });
        if (!response.ok) return;
        const text = await response.text();
        const items = text.split("<item>").slice(1);

        for (const raw of items.slice(0, 30)) {
          const titleMatch =
            raw.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/s) || raw.match(/<title>(.*?)<\/title>/s);
          const linkMatch =
            raw.match(/<link>(.*?)<\/link>/s) || raw.match(/<guid[^>]*>(https?:\/\/[^\s<]+)<\/guid>/s);
          const pubDateMatch = raw.match(/<pubDate>(.*?)<\/pubDate>/s);
          const enclosureMatch = raw.match(/<enclosure[^>]+url=["']([^"']+)["']/s);
          const imgMatch = raw.match(/<img[^>]+src=["']([^"']+)["']/s);
          const descMatch =
            raw.match(/<content:encoded><!\[CDATA\[(.*?)\]\]><\/content:encoded>/s) ||
            raw.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/s) ||
            raw.match(/<description>(.*?)<\/description>/s);

          const title = decodeXmlEntities(titleMatch ? titleMatch[1].trim() : "");
          const link = decodeXmlEntities(linkMatch ? linkMatch[1].trim() : "");
          if (!title || !link) continue;

          let rawImg = enclosureMatch ? enclosureMatch[1] : imgMatch ? imgMatch[1] : null;
          if (rawImg) {
            rawImg = decodeXmlEntities(rawImg).replace(/&amp;/g, "&");
          }

          const rawDesc = descMatch ? descMatch[1] : "";
          const snippet = cleanHtmlSnippet(rawDesc).slice(0, 220);

          const textToSearch = (title + " " + snippet).toUpperCase();
          const matchedTarget = isMarket || textToSearch.includes(cleanTarget);

          const related: string[] = [];
          if (!isMarket) related.push(targetSymbol);

          const dateVal = pubDateMatch ? Date.parse(pubDateMatch[1].trim()) : Date.now();
          const publishedAt = Number.isFinite(dateVal)
            ? new Date(dateVal).toISOString()
            : new Date().toISOString();
          const scored = scoreNewsImpact(title);

          const finalImg = rawImg || getEditorialFallbackImage(title, targetSymbol);

          results.push({
            id: link,
            title,
            publisher: feed.name,
            url: link,
            publishedAt,
            relatedSymbols: related,
            impactScore: scored.impactScore,
            impactLevel: scored.impactLevel,
            impactLabel: scored.impactLabel,
            sentiment: scored.sentiment,
            events: scored.events,
            imageUrl: finalImg,
            snippet: snippet || title,
            priority: matchedTarget ? (isMarket ? 1 : 3) : 0,
          });
        }
      } catch {
        // Abaikan error per feed
      }
    }),
  );

  return results
    .sort((a, b) => {
      const pDiff = (b.priority || 0) - (a.priority || 0);
      if (pDiff !== 0) return pDiff;
      return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    })
    .slice(0, maxCount);
}

async function fetchGoogleNewsRss(query: string, maxCount: number, symbol = ""): Promise<NewsItem[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return [];
    const text = await response.text();
    const items = text.split("<item>").slice(1);
    const results: NewsItem[] = [];

    for (const raw of items.slice(0, maxCount * 2)) {
      const titleMatch = raw.match(/<title>(.*?)<\/title>/s);
      const linkMatch = raw.match(/<link\s*>(.*?)<\/link>/s) || raw.match(/<link\s*\/>\s*(https?:\/\/[^\s<]+)/s);
      const pubDateMatch = raw.match(/<pubDate>(.*?)<\/pubDate>/s);
      const sourceMatch = raw.match(/<source[^>]*>(.*?)<\/source>/s);
      const descMatch = raw.match(/<description>(.*?)<\/description>/s);

      const title = decodeXmlEntities(titleMatch ? titleMatch[1].trim() : "");
      const link = decodeXmlEntities(linkMatch ? linkMatch[1].trim() : "");
      if (!title || !link) continue;

      const publisher = sourceMatch ? decodeXmlEntities(sourceMatch[1].trim()) : "Google News";
      const dateVal = pubDateMatch ? Date.parse(pubDateMatch[1].trim()) : Date.now();
      const publishedAt = Number.isFinite(dateVal) ? new Date(dateVal).toISOString() : new Date().toISOString();
      const scored = scoreNewsImpact(title);
      const snippet = descMatch ? cleanHtmlSnippet(descMatch[1]).slice(0, 200) : title;
      const imageUrl = getEditorialFallbackImage(title, symbol);

      results.push({
        id: link,
        title,
        publisher,
        url: link,
        publishedAt,
        relatedSymbols: symbol ? [symbol] : [],
        impactScore: scored.impactScore,
        impactLevel: scored.impactLevel,
        impactLabel: scored.impactLabel,
        sentiment: scored.sentiment,
        events: scored.events,
        imageUrl,
        snippet: snippet || title,
      });

      if (results.length >= maxCount) break;
    }

    return results;
  } catch {
    return [];
  }
}

export class YahooMarketData implements MarketDataProviders {
  private readonly yf: InstanceType<typeof YahooFinance>;
  private readonly cache: TtlCache;

  constructor(cache: TtlCache = new TtlCache()) {
    this.cache = cache;
    this.yf = new YahooFinance({
      suppressNotices: ["yahooSurvey"],
      versionCheck: false,
    });
  }

  async quote(symbol: string): Promise<Quote> {
    return this.cache.getOrLoad(`quote:${symbol}`, TTL.quoteMs, async () => {
      try {
        const raw = (await this.yf.quote(symbol, {}, NO_VALIDATE)) as unknown;
        const mapped = this.mapQuote(Array.isArray(raw) ? raw[0] : raw, symbol);
        if (mapped) return mapped;
        throw new Error("Harga pasar tidak tersedia");
      } catch (error) {
        throw new AppError(
          `Gagal mengambil quote ${symbol} dari Yahoo Finance: ${errorMessage(error)}`,
          502,
          "upstream_error",
          { provider: "yahoo-finance", symbol, operation: "quote" },
        );
      }
    });
  }

  async quotes(symbols: string[]): Promise<Quote[]> {
    const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
    if (unique.length === 0) return [];
    try {
      const raw = (await this.yf.quote(unique, {}, NO_VALIDATE)) as unknown;
      const list = Array.isArray(raw) ? raw : [raw];
      return list
        .map((entry) => this.mapQuote(entry, asString(asRecord(entry)?.symbol) ?? ""))
        .filter((entry): entry is Quote => entry !== null);
    } catch (error) {
      throw new AppError(
        `Gagal mengambil ${unique.length} quote sekaligus dari Yahoo Finance: ${errorMessage(error)}`,
        502,
        "upstream_error",
        { provider: "yahoo-finance", operation: "quote-batch" },
      );
    }
  }

  async history(symbol: string, options: HistoryOptions = {}): Promise<PriceSeries> {
    const range = options.range ?? "2y";
    const interval = options.interval ?? "1d";
    return this.chartSeries(symbol, range, interval);
  }

  async fundamentals(symbol: string): Promise<Fundamentals> {
    return this.cache.getOrLoad(`fundamentals:${symbol}`, TTL.fundamentalsMs, async () => {
      try {
        const raw = (await this.yf.quoteSummary(symbol, {
          modules: [
            "price",
            "summaryDetail",
            "defaultKeyStatistics",
            "financialData",
            "summaryProfile",
            "calendarEvents",
          ],
        }, NO_VALIDATE)) as unknown;
        const summary = asRecord(raw);
        if (!summary) throw new Error("Respon fundamental kosong");

        const price = asRecord(summary.price);
        const detail = asRecord(summary.summaryDetail);
        const keyStats = asRecord(summary.defaultKeyStatistics);
        const financial = asRecord(summary.financialData);
        const profile = asRecord(summary.summaryProfile);
        const calendar = asRecord(summary.calendarEvents);
        const earnings = asRecord(calendar?.earnings);
        const earningsDateRaw = Array.isArray(earnings?.earningsDate)
          ? earnings?.earningsDate[0]
          : earnings?.earningsDate;

        const marketCap = asNumber(price?.marketCap) ?? asNumber(detail?.marketCap);
        const freeCashflow = asNumber(financial?.freeCashflow);
        const fcfYieldPct =
          freeCashflow !== null && marketCap !== null && marketCap > 0
            ? (freeCashflow / marketCap) * 100
            : null;

        const warnings: string[] = [];
        const trailingPE = asNumber(detail?.trailingPE) ?? asNumber(keyStats?.trailingPE);
        if (trailingPE !== null && trailingPE <= 0) {
          warnings.push("PER trailing negatif: emiten sedang merugi.");
        }
        if (!profile?.sector) {
          warnings.push("Sektor emiten tidak tersedia; perbandingan rasio antar sektor tidak dilakukan.");
        }

        return {
          symbol,
          fetchedAt: new Date().toISOString(),
          currency: asString(price?.currency) ?? asString(detail?.currency),
          sector: asString(profile?.sector),
          industry: asString(profile?.industry),
          marketCap,
          trailingPE,
          forwardPE: asNumber(keyStats?.forwardPE) ?? asNumber(detail?.forwardPE),
          priceToBook: asNumber(keyStats?.priceToBook),
          evToEbitda: asNumber(keyStats?.enterpriseToEbitda),
          pegRatio: asNumber(keyStats?.pegRatio),
          freeCashflow,
          operatingCashflow: asNumber(financial?.operatingCashflow),
          fcfYieldPct,
          returnOnEquityPct: fractionToPct(asNumber(financial?.returnOnEquity)),
          returnOnAssetsPct: fractionToPct(asNumber(financial?.returnOnAssets)),
          grossMarginPct: fractionToPct(asNumber(financial?.grossMargins)),
          operatingMarginPct: fractionToPct(asNumber(financial?.operatingMargins)),
          profitMarginPct: fractionToPct(asNumber(financial?.profitMargins)),
          debtToEquityPct: asNumber(financial?.debtToEquity),
          currentRatio: asNumber(financial?.currentRatio),
          revenueGrowthPct: fractionToPct(asNumber(financial?.revenueGrowth)),
          earningsGrowthPct: fractionToPct(asNumber(financial?.earningsGrowth)),
          epsTrailing: asNumber(keyStats?.trailingEps),
          epsForward: asNumber(keyStats?.forwardEps),
          dividendYieldPct: fractionToPct(asNumber(detail?.dividendYield)),
          beta: asNumber(keyStats?.beta) ?? asNumber(detail?.beta),
          totalCash: asNumber(financial?.totalCash),
          totalDebt: asNumber(financial?.totalDebt),
          revenue: asNumber(financial?.totalRevenue),
          periodEnd: asIso(keyStats?.mostRecentQuarter),
          lastFiscalYearEnd: asIso(keyStats?.lastFiscalYearEnd),
          earningsDate: asIso(earningsDateRaw),
          warnings,
        } satisfies Fundamentals;
      } catch (error) {
        throw new AppError(
          `Gagal mengambil fundamental ${symbol} dari Yahoo Finance: ${errorMessage(error)}`,
          502,
          "upstream_error",
          { provider: "yahoo-finance", symbol, operation: "fundamentals" },
        );
      }
    });
  }

  async financialHistory(symbol: string): Promise<FinancialPeriod[]> {
    return this.cache.getOrLoad(`financials:${symbol}`, TTL.fundamentalsMs, async () => {
      try {
        const raw = (await this.yf.fundamentalsTimeSeries(symbol, {
          period1: "2018-01-01",
          type: "annual",
          module: "all",
        }, NO_VALIDATE)) as unknown;

        const rows = Array.isArray(raw) ? raw : [];
        const byYear = new Map<number, FinancialPeriod>();
        for (const entry of rows) {
          const record = asRecord(entry);
          if (!record) continue;
          const periodEnd = asIso(record.date);
          if (!periodEnd) continue;
          const period = this.toFinancialPeriod(
            record,
            periodEnd,
            new Date(periodEnd).getUTCFullYear(),
          );
          if (!period) continue;
          byYear.set(period.fiscalYear, period);
        }

        const periods = [...byYear.values()].sort((a, b) => a.fiscalYear - b.fiscalYear);
        for (let index = 0; index < periods.length; index += 1) {
          const current = periods[index];
          const previous = index > 0 ? periods[index - 1] : null;
          if (!current) continue;
          const revenue = current.totalRevenue ?? current.operatingRevenue;
          const previousRevenue = previous
            ? (previous.totalRevenue ?? previous.operatingRevenue)
            : null;
          current.grossMarginPct = marginPct(current.grossProfit, revenue);
          current.operatingMarginPct = marginPct(current.operatingIncome, revenue);
          current.netMarginPct = marginPct(current.netIncome, revenue);
          current.revenueGrowthPct = growthPct(revenue, previousRevenue);
          current.netIncomeGrowthPct = growthPct(current.netIncome, previous?.netIncome ?? null);
        }

        return periods.slice(-5);
      } catch (error) {
        throw new AppError(
          `Gagal mengambil laporan keuangan ${symbol} dari Yahoo Finance: ${errorMessage(error)}`,
          502,
          "upstream_error",
          { provider: "yahoo-finance", symbol, operation: "financial-history" },
        );
      }
    });
  }

  async companyOverview(symbol: string): Promise<CompanyOverview> {
    return this.cache.getOrLoad(`overview:${symbol}`, TTL.fundamentalsMs, async () => {
      try {
        const raw = (await this.yf.quoteSummary(symbol, {
          modules: [
            "price",
            "summaryDetail",
            "assetProfile",
            "summaryProfile",
            "defaultKeyStatistics",
            "financialData",
          ],
        }, NO_VALIDATE)) as unknown;
        const summary = asRecord(raw);
        if (!summary) throw new Error("Respon profil perusahaan kosong");

        const profileRaw = asRecord(summary.assetProfile) ?? {};
        const profileFallback = asRecord(summary.summaryProfile) ?? {};
        const price = asRecord(summary.price);
        const detail = asRecord(summary.summaryDetail);
        const keyStatsRaw = asRecord(summary.defaultKeyStatistics);
        const financial = asRecord(summary.financialData);

        const addressParts = [asString(profileRaw.address1), asString(profileRaw.address2)].filter(
          (part): part is string => part !== null,
        );
        const officers: CompanyOfficer[] = [];
        if (Array.isArray(profileRaw.companyOfficers)) {
          for (const entry of profileRaw.companyOfficers) {
            const officer = asRecord(entry);
            if (!officer) continue;
            const name = asString(officer.name);
            if (!name) continue;
            officers.push({ name, title: asString(officer.title) });
          }
        }

        const profile: CompanyProfile = {
          symbol,
          code: symbol.replace(/\.JK$/i, ""),
          name: asString(price?.shortName) ?? asString(price?.longName),
          longName: asString(price?.longName) ?? asString(price?.shortName),
          sector:
            asString(profileRaw.sector) ??
            asString(profileRaw.sectorDisp) ??
            asString(profileFallback.sector),
          subSector: null,
          industry:
            asString(profileRaw.industry) ??
            asString(profileRaw.industryDisp) ??
            asString(profileFallback.industry),
          subIndustry: null,
          address: addressParts.length > 0 ? addressParts.join("\n") : null,
          city: asString(profileRaw.city) ?? asString(profileFallback.city),
          country: asString(profileRaw.country) ?? asString(profileFallback.country),
          website: asString(profileRaw.website) ?? asString(profileFallback.website),
          phone: asString(profileRaw.phone) ?? asString(profileFallback.phone),
          email: null,
          board: null,
          listingDate: null,
          mainBusiness: null,
          description:
            asString(profileRaw.longBusinessSummary) ??
            asString(profileFallback.longBusinessSummary),
          employees:
            asNumber(profileRaw.fullTimeEmployees) ?? asNumber(profileFallback.fullTimeEmployees),
          secretary: null,
          officers: officers.slice(0, 8),
          directors: [],
          commissioners: [],
          shareholders: [],
        };

        const keyStats: ScreenerKeyStats = {
          marketCap:
            asNumber(price?.marketCap) ??
            asNumber(detail?.marketCap) ??
            asNumber(keyStatsRaw?.marketCap),
          enterpriseValue: asNumber(keyStatsRaw?.enterpriseValue),
          trailingPE: asNumber(detail?.trailingPE) ?? asNumber(keyStatsRaw?.trailingPE),
          forwardPE: asNumber(keyStatsRaw?.forwardPE) ?? asNumber(detail?.forwardPE),
          priceToBook: asNumber(keyStatsRaw?.priceToBook),
          evToEbitda: asNumber(keyStatsRaw?.enterpriseToEbitda),
          pegRatio: asNumber(keyStatsRaw?.pegRatio),
          dividendYieldPct: fractionToPct(asNumber(detail?.dividendYield)),
          beta: asNumber(keyStatsRaw?.beta) ?? asNumber(detail?.beta),
          sharesOutstanding: asNumber(keyStatsRaw?.sharesOutstanding),
          floatShares: asNumber(keyStatsRaw?.floatShares),
          returnOnEquityPct: fractionToPct(asNumber(financial?.returnOnEquity)),
          returnOnAssetsPct: fractionToPct(asNumber(financial?.returnOnAssets)),
          grossMarginPct: fractionToPct(asNumber(financial?.grossMargins)),
          operatingMarginPct: fractionToPct(asNumber(financial?.operatingMargins)),
          profitMarginPct: fractionToPct(asNumber(financial?.profitMargins)),
          debtToEquityPct: asNumber(financial?.debtToEquity),
          currentRatio: asNumber(financial?.currentRatio),
          totalCash: asNumber(financial?.totalCash),
          totalDebt: asNumber(financial?.totalDebt),
          revenue: asNumber(financial?.totalRevenue),
          revenueGrowthPct: fractionToPct(asNumber(financial?.revenueGrowth)),
          earningsGrowthPct: fractionToPct(asNumber(financial?.earningsGrowth)),
          freeCashflow: asNumber(financial?.freeCashflow),
          operatingCashflow: asNumber(financial?.operatingCashflow),
          fiscalYearEnd: asIso(keyStatsRaw?.lastFiscalYearEnd),
        };

        return { profile, keyStats } satisfies CompanyOverview;
      } catch (error) {
        throw new AppError(
          `Gagal mengambil profil ${symbol} dari Yahoo Finance: ${errorMessage(error)}`,
          502,
          "upstream_error",
          { provider: "yahoo-finance", symbol, operation: "company-overview" },
        );
      }
    });
  }

  async news(symbol: string, count = 10): Promise<NewsItem[]> {
    const safeCount = Math.min(Math.max(count, 1), 40);
    return this.cache.getOrLoad(`news:${symbol}:${safeCount}`, TTL.newsMs, async () => {
      const seen = new Set<string>();
      const items: NewsItem[] = [];

      // 1. Ambil dari Media Finansial Indonesia langsung (CNBC Indonesia, Detik Finance, Antara)
      try {
        const idnItems = await fetchIndonesianFeeds(symbol, safeCount);
        for (const it of idnItems) {
          const normTitle = it.title.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (!seen.has(normTitle)) {
            seen.add(normTitle);
            items.push(it);
          }
        }
      } catch {
        // Abaikan kegagalan feed lokal, lanjut ke Yahoo / Google News
      }

      // 2. Ambil dari Google News RSS berbahasa Indonesia
      const cleanCode = symbol.replace(/\.JK$/i, "").replace(/^\^/, "");
      const isIdx = symbol.endsWith(".JK") || symbol === "^JKSE" || symbol === "JKSE";
      const rssQuery = isIdx
        ? symbol === "^JKSE" || symbol === "JKSE"
          ? "saham IHSG OR bursa efek indonesia"
          : `saham ${cleanCode} OR "${cleanCode}.JK"`
        : `${cleanCode} stock news`;

      try {
        const rssItems = await fetchGoogleNewsRss(rssQuery, safeCount, symbol);
        for (const rItem of rssItems) {
          const normTitle = rItem.title.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (!seen.has(normTitle)) {
            seen.add(normTitle);
            if (!rItem.relatedSymbols.includes(symbol)) {
              rItem.relatedSymbols.push(symbol);
            }
            items.push(rItem);
          }
        }
      } catch {
        // Abaikan kegagalan RSS tambahan
      }

      // 3. Ambil dari Yahoo Finance untuk memperkaya berita global / emiten
      try {
        const queriesToTry = [symbol];
        if (symbol.includes(".JK")) {
          queriesToTry.push(symbol.replace(/\.JK$/i, ""));
        }

        for (const query of queriesToTry) {
          const result = (await this.yf.search(
            query,
            {
              quotesCount: 0,
              newsCount: safeCount,
              enableFuzzyQuery: false,
            },
            NO_VALIDATE,
          )) as unknown;
          const record = asRecord(result);
          const rawNews = Array.isArray(record?.news) ? record?.news : [];

          for (const entry of rawNews) {
            const item = asRecord(entry);
            if (!item) continue;
            const title = asString(item.title);
            if (!title) continue;
            const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (seen.has(normTitle)) continue;
            seen.add(normTitle);

            const publishedAt = asIso(item.providerPublishTime) ?? new Date().toISOString();
            const rawUrl = asString(item.link);
            const url = rawUrl ?? `https://www.google.com/search?q=${encodeURIComponent(title)}`;
            const related = Array.isArray(item.relatedTickers)
              ? item.relatedTickers.filter((ticker): ticker is string => typeof ticker === "string")
              : [];
            const scored = scoreNewsImpact(title);

            const thumb = asRecord(item.thumbnail);
            const resolutions = Array.isArray(thumb?.resolutions) ? thumb.resolutions : [];
            let imageUrl: string | null = null;
            if (resolutions.length > 0) {
              const best = asRecord(resolutions[resolutions.length - 1]) ?? asRecord(resolutions[0]);
              imageUrl = asString(best?.url) ?? null;
            }

            items.push({
              id: asString(item.uuid) ?? url,
              title,
              publisher: asString(item.publisher) ?? "Yahoo Finance",
              url,
              publishedAt,
              relatedSymbols: related,
              impactScore: scored.impactScore,
              impactLevel: scored.impactLevel,
              impactLabel: scored.impactLabel,
              sentiment: scored.sentiment,
              events: scored.events,
              imageUrl: imageUrl || getEditorialFallbackImage(title, symbol),
              snippet: title,
            });
          }
          if (items.length >= safeCount * 2) break;
        }
      } catch {
        // Jangan langsung gagal
      }

      // Pastikan semua item memiliki nilai gambar, ringkasan, dampak, dan link
      for (const it of items) {
        if (!it.impactScore) {
          const scored = scoreNewsImpact(it.title);
          it.impactScore = scored.impactScore;
          it.impactLevel = scored.impactLevel;
          it.impactLabel = scored.impactLabel;
          it.sentiment = scored.sentiment;
          it.events = scored.events;
        }
        if (!it.imageUrl) {
          it.imageUrl = getEditorialFallbackImage(it.title, symbol);
        }
        if (!it.snippet) {
          it.snippet = it.title;
        }
        if (!it.url) {
          it.url = `https://www.google.com/search?q=${encodeURIComponent(it.title)}`;
        }
      }

      return items
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
        .slice(0, safeCount);
    });
  }

  async macro(benchmarkSymbol: string): Promise<MacroSnapshot> {
    return this.cache.getOrLoad(`macro:${benchmarkSymbol}`, TTL.macroMs, async () => {
      const warnings: string[] = [];
      const series = await Promise.all(
        [
          { key: "benchmark", symbol: benchmarkSymbol, range: "1y" as HistoryRange },
          { key: "vix", symbol: "^VIX", range: "6mo" as HistoryRange },
          { key: "tenYear", symbol: "^TNX", range: "6mo" as HistoryRange },
          { key: "threeMonth", symbol: "^IRX", range: "6mo" as HistoryRange },
          { key: "dollar", symbol: "DX-Y.NYB", range: "6mo" as HistoryRange },
          { key: "gold", symbol: "GC=F", range: "6mo" as HistoryRange },
          { key: "oil", symbol: "CL=F", range: "6mo" as HistoryRange },
        ].map(async (entry) => {
          try {
            const data = await this.chartSeries(entry.symbol, entry.range, "1d");
            const closes = data.candles.map((candle) => candle.close);
            return { key: entry.key, closes, error: null as string | null };
          } catch (error) {
            return { key: entry.key, closes: [] as number[], error: errorMessage(error) };
          }
        }),
      );

      const byKey = new Map(series.map((entry) => [entry.key, entry]));
      const closesOf = (key: string): number[] => {
        const entry = byKey.get(key);
        if (!entry) return [];
        if (entry.error) {
          warnings.push(`Data ${key} tidak tersedia: ${entry.error}`);
        }
        return entry.closes;
      };

      const benchmarkCloses = closesOf("benchmark");
      const vixCloses = closesOf("vix");
      const tenYearCloses = closesOf("tenYear").map(normalizeYield);
      const threeMonthCloses = closesOf("threeMonth").map(normalizeYield);
      const dollarCloses = closesOf("dollar");
      const goldCloses = closesOf("gold");
      const oilCloses = closesOf("oil");

      const tenYear = latest(tenYearCloses);
      const threeMonth = latest(threeMonthCloses);
      const tenYearPrev = tenYearCloses.length > 20 ? tenYearCloses[tenYearCloses.length - 21] : null;
      const benchmarkLast = latest(benchmarkCloses);
      const sma50 = smaLast(benchmarkCloses, 50);
      const sma200 = smaLast(benchmarkCloses, 200);

      if (benchmarkCloses.length < 200) {
        warnings.push("Riwayat benchmark kurang dari 200 hari; tren jangka panjang kurang akurat.");
      }

      return {
        asOf: new Date().toISOString(),
        benchmarkSymbol,
        benchmarkPrice: benchmarkLast,
        benchmarkChange60dPct: changePctAgo(benchmarkCloses, 60),
        benchmarkAboveSma50: benchmarkLast !== null && sma50 !== null ? benchmarkLast > sma50 : null,
        benchmarkAboveSma200:
          benchmarkLast !== null && sma200 !== null ? benchmarkLast > sma200 : null,
        vix: latest(vixCloses),
        vixChange20dPct: changePctAgo(vixCloses, 20),
        tenYearYieldPct: tenYear,
        threeMonthYieldPct: threeMonth,
        yieldCurveSpreadPct: tenYear !== null && threeMonth !== null ? tenYear - threeMonth : null,
        tenYearChange20dBps:
          tenYear !== null && tenYearPrev !== null ? (tenYear - tenYearPrev) * 100 : null,
        dollarIndex: latest(dollarCloses),
        dollarChange20dPct: changePctAgo(dollarCloses, 20),
        goldChange20dPct: changePctAgo(goldCloses, 20),
        oilChange20dPct: changePctAgo(oilCloses, 20),
        warnings,
      } satisfies MacroSnapshot;
    });
  }

  private mapQuote(raw: unknown, fallbackSymbol: string): Quote | null {
    const record = asRecord(raw);
    if (!record) return null;
    const price = asNumber(record.regularMarketPrice);
    if (price === null) return null;
    const symbol = asString(record.symbol) ?? fallbackSymbol;
    if (symbol === "") return null;

    return {
      symbol,
      name: asString(record.longName) ?? asString(record.shortName),
      currency: asString(record.currency),
      exchange: asString(record.fullExchangeName) ?? asString(record.exchange),
      marketState: asString(record.marketState),
      price,
      previousClose: asNumber(record.regularMarketPreviousClose),
      changePct: asNumber(record.regularMarketChangePercent),
      volume: asNumber(record.regularMarketVolume),
      averageVolume10d: asNumber(record.averageDailyVolume10Day),
      marketCap: asNumber(record.marketCap),
      fiftyTwoWeekHigh: asNumber(record.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: asNumber(record.fiftyTwoWeekLow),
      marketTime: asIso(record.regularMarketTime) ?? new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      trailingPE: asNumber(record.trailingPE),
      priceToBook: asNumber(record.priceToBook),
      dividendYieldPct: asNumber(record.dividendYield),
      epsTrailing: asNumber(record.epsTrailingTwelveMonths),
    } satisfies Quote;
  }

  private toFinancialPeriod(
    record: Record<string, unknown>,
    periodEnd: string,
    fiscalYear: number,
  ): FinancialPeriod | null {
    const totalRevenue = asNumber(record.totalRevenue);
    const operatingRevenue = asNumber(record.operatingRevenue);
    const costOfRevenue = asNumber(record.costOfRevenue);
    const grossProfit = asNumber(record.grossProfit);
    const operatingExpense = asNumber(record.operatingExpense);
    const operatingIncome =
      asNumber(record.operatingIncome) ?? asNumber(record.totalOperatingIncomeAsReported);
    const ebit = asNumber(record.ebit) ?? asNumber(record.EBIT);
    const ebitda =
      asNumber(record.ebitda) ?? asNumber(record.EBITDA) ?? asNumber(record.normalizedEBITDA);
    const netIncome =
      asNumber(record.netIncome) ?? asNumber(record.netIncomeCommonStockholders);
    const netIncomeCommonStockholders = asNumber(record.netIncomeCommonStockholders);
    const totalAssets = asNumber(record.totalAssets);
    const totalLiabilities =
      asNumber(record.totalLiabilitiesNetMinorityInterest) ??
      asNumber(record.totalLiabilities);
    const stockholdersEquity =
      asNumber(record.stockholdersEquity) ??
      asNumber(record.commonStockEquity) ??
      asNumber(record.totalEquityGrossMinorityInterest);
    const cashAndCashEquivalents = asNumber(record.cashAndCashEquivalents);
    const totalDebt = asNumber(record.totalDebt);
    const operatingCashFlow =
      asNumber(record.operatingCashFlow) ??
      asNumber(record.cashFlowFromContinuingOperatingActivities) ??
      asNumber(record.cashFlowsfromusedinOperatingActivitiesDirect);
    const freeCashFlow = asNumber(record.freeCashFlow);
    const capitalExpenditure = asNumber(record.capitalExpenditure);
    const basicEPS = asNumber(record.basicEPS);
    const dilutedEPS = asNumber(record.dilutedEPS);

    if (
      [totalRevenue, operatingRevenue, grossProfit, netIncome, totalAssets].every(
        (value) => value === null,
      )
    ) {
      return null;
    }

    return {
      fiscalYear,
      periodEnd,
      totalRevenue,
      operatingRevenue,
      costOfRevenue,
      grossProfit,
      operatingExpense,
      operatingIncome,
      ebit,
      ebitda,
      netIncome,
      netIncomeCommonStockholders,
      totalAssets,
      totalLiabilities,
      stockholdersEquity,
      cashAndCashEquivalents,
      totalDebt,
      operatingCashFlow,
      freeCashFlow,
      capitalExpenditure,
      basicEPS,
      dilutedEPS,
      grossMarginPct: null,
      operatingMarginPct: null,
      netMarginPct: null,
      revenueGrowthPct: null,
      netIncomeGrowthPct: null,
    };
  }

  private async chartSeries(
    symbol: string,
    range: HistoryRange,
    interval: HistoryInterval,
  ): Promise<PriceSeries> {
    return this.cache.getOrLoad(`chart:${symbol}:${range}:${interval}`, TTL.historyMs, async () => {
      const days = RANGE_DAYS[range];
      const period1 = days === null ? new Date("1990-01-01T00:00:00Z") : new Date(Date.now() - days * DAY_MS);

      const MAX_RETRIES = 3;
      let lastError: unknown = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = (await this.yf.chart(symbol, {
            period1,
            interval,
            events: "div|split",
          }, NO_VALIDATE)) as {
            quotes: Array<{
              date: Date;
              open: number | null;
              high: number | null;
              low: number | null;
              close: number | null;
              volume: number | null;
              adjclose?: number | null;
            }>;
            meta?: Record<string, unknown>;
          };

          const candles: Candle[] = [];
          for (const row of result.quotes) {
            if (
              row.open === null ||
              row.high === null ||
              row.low === null ||
              row.close === null ||
              row.volume === null
            ) {
              continue;
            }
            candles.push({
              date: row.date.toISOString(),
              open: row.open,
              high: row.high,
              low: row.low,
              close: row.close,
              volume: row.volume,
              adjClose: row.adjclose ?? null,
            });
          }

          if (candles.length === 0) throw new Error("Tidak ada candle valid");

          return {
            symbol,
            currency: asString((result.meta as Record<string, unknown>).currency),
            interval,
            fetchedAt: new Date().toISOString(),
            candles,
          } satisfies PriceSeries;
        } catch (error) {
          lastError = error;
          // Retry hanya untuk transient errors (network, timeout, rate limit)
          const msg = errorMessage(error).toLowerCase();
          const isTransient =
            msg.includes("timeout") ||
            msg.includes("econnreset") ||
            msg.includes("econnrefused") ||
            msg.includes("fetch") ||
            msg.includes("network") ||
            msg.includes("socket") ||
            msg.includes("too many") ||
            msg.includes("429") ||
            msg.includes("503") ||
            msg.includes("502");
          if (!isTransient || attempt === MAX_RETRIES) break;
          // Exponential backoff: 800ms, 2000ms
          await new Promise((resolve) => setTimeout(resolve, attempt * 800));
        }
      }

      throw new AppError(
        `Gagal mengambil riwayat harga ${symbol} (${MAX_RETRIES}x percobaan): ${errorMessage(lastError)}`,
        502,
        "upstream_error",
        { provider: "yahoo-finance", symbol, operation: "chart" },
      );
    });
  }
}
