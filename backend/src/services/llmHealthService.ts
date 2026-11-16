import type { LlmConfig } from "../config.js";
import { errorMessage } from "../lib/errors.js";

/**
 * Status "AI siap dipakai" untuk ditampilkan di halaman utama.
 * - healthy : gateway membalas normal.
 * - error   : gateway/API key/model bermasalah (agen akan gagal).
 * - disabled: LLM_API_KEY kosong, agen jatuh ke mode heuristik.
 * - unknown : belum pernah dicek.
 */
export type LlmHealthState = "healthy" | "error" | "disabled" | "unknown";

export interface LlmHealthSnapshot {
  state: LlmHealthState;
  /** true hanya kalau probe terakhir sukses. */
  ok: boolean;
  enabled: boolean;
  model: string;
  modelReplied?: string | null;
  replyPreview?: string | null;
  /** Pesan siap tampil untuk pengguna (Bahasa Indonesia). */
  message: string;
  /** Detail teknis (HTTP code, pesan gateway). */
  error: string | null;
  latencyMs: number | null;
  checkedAt: string | null;
  /** Jumlah kegagalan beruntun (direset saat sukses). */
  consecutiveFailures: number;
  probeTimeoutMs: number;
}

export interface LlmHealthOptions {
  config: LlmConfig;
  /** Umur cache hasil probe. Permintaan berikutnya dalam jendela ini memakai hasil lama. */
  ttlMs?: number;
  /** Batas waktu satu probe. Sengaja lebih pendek dari LLM_TIMEOUT_MS agen. */
  probeTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface ProbeResult {
  ok: boolean;
  error: string | null;
  latencyMs: number;
  modelReplied?: string | null;
  replyPreview?: string | null;
}

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_PROBE_TIMEOUT_MS = 15_000;
/** Jeda sebelum percobaan kedua saat probe pertama gagal (mengurangi alarm palsu). */
const RETRY_DELAY_MS = 1_500;

export class LlmHealthService {
  private readonly config: LlmConfig;
  private readonly ttlMs: number;
  private readonly probeTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  private snapshot: LlmHealthSnapshot;
  private consecutiveFailures = 0;
  private inFlight: Promise<LlmHealthSnapshot> | null = null;

  constructor(options: LlmHealthOptions) {
    this.config = options.config;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.probeTimeoutMs = options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.snapshot = {
      state: options.config.apiKey ? "unknown" : "disabled",
      ok: false,
      enabled: options.config.apiKey !== null,
      model: options.config.model,
      message: options.config.apiKey
        ? "Status AI belum diperiksa."
        : "LLM belum dikonfigurasi: agen memakai analisis heuristik.",
      error: null,
      latencyMs: null,
      checkedAt: null,
      consecutiveFailures: 0,
      probeTimeoutMs: this.probeTimeoutMs,
    };
  }

  getSnapshot(): LlmHealthSnapshot {
    return this.snapshot;
  }

  /**
   * Cek status LLM. Hasil di-cache selama `ttlMs`; `force` memaksa probe baru
   * (dipakai tombol "Cek ulang" di popup peringatan).
   */
  async check(options: { force?: boolean } = {}): Promise<LlmHealthSnapshot> {
    if (!this.config.apiKey) {
      return this.snapshot;
    }
    if (!options.force && this.isFresh()) {
      return this.snapshot;
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private isFresh(): boolean {
    if (this.snapshot.checkedAt === null) return false;
    const age = Date.now() - Date.parse(this.snapshot.checkedAt);
    return Number.isFinite(age) && age >= 0 && age < this.ttlMs;
  }

  private async run(): Promise<LlmHealthSnapshot> {
    let result = await this.probe();
    if (!result.ok) {
      await delay(RETRY_DELAY_MS);
      const retry = await this.probe();
      // Laporkan percobaan terakhir, tapi simpan galat pertama bila lebih informatif.
      result = retry.ok ? retry : { ...retry, error: retry.error ?? result.error };
    }

    this.consecutiveFailures = result.ok ? 0 : this.consecutiveFailures + 1;
    this.snapshot = {
      state: result.ok ? "healthy" : "error",
      ok: result.ok,
      enabled: true,
      model: this.config.model,
      modelReplied: result.modelReplied,
      replyPreview: result.replyPreview,
      message: result.ok
        ? `Model ${this.config.model} terverifikasi aktif & merespons normal.`
        : "Model LLM tidak dapat dihubungi atau tidak merespons. Agen AI tidak bisa berjalan.",
      error: result.error,
      latencyMs: result.latencyMs,
      checkedAt: new Date().toISOString(),
      consecutiveFailures: this.consecutiveFailures,
      probeTimeoutMs: this.probeTimeoutMs,
    };
    return this.snapshot;
  }

  private async probe(): Promise<ProbeResult> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.probeTimeoutMs);
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: ["Bearer", this.config.apiKey ?? ""].join(" "),
          // Gateway tertentu (mis. http://localhost:20128/v1) membalas SSE bila
          // klien tidak meminta JSON secara eksplisit.
          Accept: "application/json",
          "User-Agent": "AgenticMarketDesk/1.0 (health-check)",
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0,
          max_tokens: 64,
          stream: false,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Balas hanya JSON: {\"ok\":true}" },
            { role: "user", content: "ping" },
          ],
        }),
        signal: controller.signal,
      });

      const text = await response.text();
      const latencyMs = Date.now() - started;

      if (!response.ok) {
        return {
          ok: false,
          error: `HTTP ${response.status}: ${text.slice(0, 240) || "(tanpa isi)"}`,
          latencyMs,
          modelReplied: null,
          replyPreview: null,
        };
      }

      // Periksa apakah respons adalah SSE atau JSON biasa
      let replyPreview: string | null = null;
      let modelReplied: string | null = null;

      if (text.trimStart().startsWith("data:")) {
        let content = "";
        for (const line of text.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const chunk = JSON.parse(data) as {
              model?: string;
              choices?: Array<{ delta?: { content?: unknown } }>;
            };
            if (!modelReplied && chunk.model) modelReplied = chunk.model;
            const piece = chunk.choices?.[0]?.delta?.content;
            if (typeof piece === "string") content += piece;
          } catch {
            // baris tak lengkap lewati
          }
        }
        replyPreview = content.trim().slice(0, 100) || null;
      } else {
        try {
          const payload = JSON.parse(text) as {
            model?: string;
            choices?: Array<{ message?: { content?: unknown } }>;
          };
          modelReplied = payload.model ?? null;
          const content = payload.choices?.[0]?.message?.content;
          replyPreview = typeof content === "string" ? content.trim().slice(0, 100) : null;
        } catch {
          // Gagal parse JSON
          const looksLikeError = text.includes("\"error\"");
          return {
            ok: false,
            error: `Respons gateway bukan JSON sah${looksLikeError ? " (berisi galat)" : ""}: ${text.slice(0, 200)}`,
            latencyMs,
            modelReplied: null,
            replyPreview: null,
          };
        }
      }

      if (!replyPreview) {
        return {
          ok: false,
          error: "Model mengembalikan respons kosong.",
          latencyMs,
          modelReplied,
          replyPreview: null,
        };
      }

      return { ok: true, error: null, latencyMs, modelReplied, replyPreview };
    } catch (error) {
      const latencyMs = Date.now() - started;
      if (error instanceof Error && error.name === "AbortError") {
        return {
          ok: false,
          error: `Probe melebihi batas ${Math.round(this.probeTimeoutMs / 1000)} detik (endpoint tidak membalas).`,
          latencyMs,
          modelReplied: null,
          replyPreview: null,
        };
      }
      return { ok: false, error: errorMessage(error), latencyMs, modelReplied: null, replyPreview: null };
    } finally {
      clearTimeout(timer);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
