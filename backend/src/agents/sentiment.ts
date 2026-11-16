import { z } from "zod";
import { clamp, formatNumber, mean, round, weightedMean } from "../lib/math.js";
import type { LlmJsonClient } from "../llm/client.js";
import type { AgentSignal, SentimentItem } from "../types.js";
import {
  EVENT_PATTERNS,
  NEGATIVE_TERMS,
  POSITIVE_TERMS,
  type LexiconTerm,
} from "./sentimentLexicon.js";
import type { Agent, AgentOutput, AnalysisContext } from "./types.js";

const SEVERITY_LABEL = (score: number): SentimentItem["label"] =>
  score > 0.15 ? "positive" : score < -0.15 ? "negative" : "neutral";

const termRegexCache = new Map<string, RegExp>();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termMatches(text: string, phrase: string): boolean {
  if (phrase.includes(" ")) return text.includes(phrase);
  let regex = termRegexCache.get(phrase);
  if (!regex) {
    regex = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i");
    termRegexCache.set(phrase, regex);
  }
  return regex.test(text);
}

function accumulate(terms: LexiconTerm[], text: string, sign: number): number {
  let total = 0;
  for (const term of terms) {
    if (termMatches(text, term.phrase)) total += sign * term.weight;
  }
  return total;
}

function lexiconScore(title: string): number {
  const text = title.toLowerCase();
  const raw = accumulate(POSITIVE_TERMS, text, 1) + accumulate(NEGATIVE_TERMS, text, -1);
  return Math.tanh(raw / 2.5);
}

function detectEvents(title: string): { events: string[]; impact: number } {
  let impact = 0.3;
  const events = new Set<string>();
  for (const pattern of EVENT_PATTERNS) {
    if (pattern.patterns.some((regex) => regex.test(title))) {
      events.add(pattern.event);
      impact = Math.max(impact, pattern.impact);
    }
  }
  return { events: [...events], impact };
}

const LlmSentimentSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().int().min(1).max(50),
      score: z.number().min(-1).max(1),
      events: z.array(z.string().min(1).max(40)).max(8).default([]),
      impact: z.number().min(0).max(1),
    }),
  ),
});

export interface SentimentDetails {
  aggregateScore: number;
  coverage: number;
  articles: SentimentItem[];
  llmUsed: boolean;
}

interface ScoredItem {
  item: SentimentItem;
  weight: number;
  relevance: number;
  ageHours: number;
}

export class SentimentAgent implements Agent<SentimentDetails> {
  readonly name = "sentiment" as const;

  constructor(private readonly llm: LlmJsonClient) {}

  async run(context: AnalysisContext): Promise<AgentOutput<SentimentDetails>> {
    const nowMs = Date.parse(context.analysisDate);
    const warnings: string[] = [];

    const scored: ScoredItem[] = [];
    for (const news of context.news) {
      const publishedMs = Date.parse(news.publishedAt);
      if (!Number.isFinite(publishedMs)) continue;
      const ageHours = Math.max(0, (nowMs - publishedMs) / 3_600_000);
      if (ageHours > 45 * 24) continue;

      const lexicon = lexiconScore(news.title);
      const events = detectEvents(news.title);
      const relevance = news.relatedSymbols
        .map((symbol) => symbol.toUpperCase())
        .includes(context.symbol.toUpperCase())
        ? 1
        : 0.75;
      const recency = Math.max(0.1, Math.pow(0.5, ageHours / 72));
      const weight = events.impact * recency * relevance;

      scored.push({
        item: {
          newsId: news.id,
          title: news.title,
          publishedAt: news.publishedAt,
          score: round(lexicon, 3),
          label: SEVERITY_LABEL(lexicon),
          events: events.events,
          impact: round(events.impact, 2),
          source: "lexicon",
        },
        weight,
        relevance,
        ageHours,
      });
    }

    const limited = scored.slice(0, 12);
    let llmUsed = false;

    if (this.llm.enabled && limited.length > 0) {
      const headlines = limited
        .map(
          (entry, index) =>
            `${index + 1}. [${new Date(entry.item.publishedAt).toISOString().slice(0, 10)}] ${entry.item.title}`,
        )
        .join("\n");
      const response = await this.llm.json({
        system:
          "Anda analis sentimen berita keuangan. Nilai dampak setiap judul berita terhadap harga saham emiten terkait. " +
          'Balas hanya JSON: {"items":[{"index":1,"score":0.0,"events":["earnings"],"impact":0.5}]}. ' +
          "score -1..1 (positif = mendukung harga), impact 0..1 (seberapa material). Jangan menambahkan teks lain.",
        user: `Emiten: ${context.symbol}\nJudul berita:\n${headlines}`,
        schema: LlmSentimentSchema,
        maxTokens: 1200,
      });

      if (response.data) {
        for (const entry of response.data.items) {
          const target = limited[entry.index - 1];
          if (!target) continue;
          target.item.score = round(entry.score, 3);
          target.item.label = SEVERITY_LABEL(entry.score);
          target.item.impact = round(clamp(entry.impact, 0, 1), 2);
          target.item.events =
            entry.events.length > 0 ? entry.events : target.item.events;
          target.item.source = "llm";
          target.weight = target.item.impact * Math.max(0.1, Math.pow(0.5, target.ageHours / 72)) * target.relevance;
          llmUsed = true;
        }
      } else if (response.error) {
        warnings.push(`Penilaian sentimen via LLM gagal, memakai leksikon: ${response.error}`);
      }
    }

    const aggregate = weightedMean(
      limited.map((entry) => ({ value: entry.item.score, weight: entry.weight })),
    );
    const aggregateScore = aggregate ?? 0;
    const recentCount = limited.filter((entry) => entry.ageHours <= 14 * 24).length;
    const coverage = clamp(recentCount / 8, 0, 1);
    const avgRecency =
      limited.length > 0 ? mean(limited.map((entry) => Math.pow(0.5, entry.ageHours / 72))) : 0;

    let confidence = 0;
    if (limited.length > 0) {
      confidence = clamp(
        0.05,
        0.8,
        0.15 + 0.08 * Math.min(limited.length, 6) + 0.2 * avgRecency + (llmUsed ? 0.03 : 0),
      );
    } else {
      warnings.push("Tidak ada berita relevan dalam 45 hari terakhir.");
    }
    if (limited.length > 0 && limited.length < 3) {
      warnings.push("Cakupan berita tipis (< 3 artikel); sentimen mudah terdistorsi.");
    }
    if (limited.some((entry) => entry.relevance < 1)) {
      warnings.push("Sebagian berita tidak secara eksplisit terkait simbol ini.");
    }

    const positiveCount = limited.filter((entry) => entry.item.label === "positive").length;
    const negativeCount = limited.filter((entry) => entry.item.label === "negative").length;
    const neutralCount = limited.length - positiveCount - negativeCount;

    const label =
      aggregateScore > 0.15 ? "positif" : aggregateScore < -0.15 ? "negatif" : "netral";
    const evidence: string[] = [];
    const top = [...limited].sort((a, b) => b.weight - a.weight).slice(0, 3);
    for (const entry of top) {
      const truncated = entry.item.title.length > 120 ? `${entry.item.title.slice(0, 117)}...` : entry.item.title;
      evidence.push(
        `"${truncated}" (${entry.item.label}, skor ${formatNumber(entry.item.score, 2)}, ${entry.item.events.join("/") || "tanpa event"}).`,
      );
    }
    evidence.push(
      `${positiveCount} positif, ${negativeCount} negatif, ${neutralCount} netral; cakupan 14 hari ${Math.round(coverage * 100)}%.`,
    );

    const metrics: AgentSignal["metrics"] = {
      articleCount: limited.length,
      recentArticleCount: recentCount,
      positiveCount,
      negativeCount,
      neutralCount,
      aggregateScore: round(aggregateScore, 3),
      coverage: round(coverage, 2),
      llmUsed,
      oldestArticleHours: limited.length > 0 ? Math.round(Math.max(...limited.map((e) => e.ageHours))) : null,
    };

    return {
      signal: {
        agent: this.name,
        asOf: context.analysisDate,
        score: round(aggregateScore, 4),
        confidence: round(confidence, 3),
        summary:
          limited.length === 0
            ? "Tidak ada berita untuk dinilai."
            : `Sentimen ${label} dari ${limited.length} artikel terbaru.`,
        evidence,
        warnings,
        metrics,
      },
      details: {
        aggregateScore: round(aggregateScore, 3),
        coverage: round(coverage, 2),
        articles: limited.map((entry) => entry.item),
        llmUsed,
      },
    };
  }
}
