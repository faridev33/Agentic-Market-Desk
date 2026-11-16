import type { ZodType } from "zod";
import type { LlmConfig } from "../config.js";
import { errorMessage } from "../lib/errors.js";

export interface LlmJsonRequest<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  maxTokens?: number;
  /** Timpa model default (dipakai roster multi-model 8 agen). */
  model?: string;
  temperature?: number;
  /** Jumlah percobaan ulang untuk galat 429/5xx/timeout. Default 2. */
  retries?: number;
}

export interface LlmJsonResponse<T> {
  data: T | null;
  error: string | null;
  raw: string | null;
  /** Model yang akhirnya menjawab (bisa beda dari yang diminta karena fallback). */
  model?: string | null;
}

export interface LlmJsonClient {
  readonly enabled: boolean;
  readonly model: string;
  json<T>(request: LlmJsonRequest<T>): Promise<LlmJsonResponse<T>>;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: unknown };
  }>;
}

function extractJson(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

/** Merangkai potongan `delta.content` dari respons SSE (gateway yang selalu streaming). */
function collectSseContent(body: string): string {
  let text = "";
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (data === "" || data === "[DONE]") continue;
    try {
      const chunk = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: unknown } }>;
      };
      const piece = chunk.choices?.[0]?.delta?.content;
      if (typeof piece === "string") text += piece;
    } catch {
      // baris SSE tidak lengkap/komentar: lewati
    }
  }
  return text;
}

export class OpenAiCompatibleLlm implements LlmJsonClient {
  readonly enabled: boolean;
  readonly model: string;
  private readonly config: LlmConfig;

  constructor(config: LlmConfig) {
    this.config = config;
    this.enabled = config.apiKey !== null;
    this.model = config.model;
  }

  async json<T>(request: LlmJsonRequest<T>): Promise<LlmJsonResponse<T>> {
    if (!this.enabled || !this.config.apiKey) {
      return { data: null, error: "LLM tidak dikonfigurasi", raw: null };
    }

    // Urutan kandidat: model yang diminta agen → model default → daftar model env → fallback bawaan.
    const candidateModels = Array.from(
      new Set(
        [
          request.model ?? "",
          this.config.model,
          ...(this.config.models ?? []),
          "ag/gemini-3.8-flash-low",
          "ag/gemini-3.8-flash-medium",
          "ag/claude-sonnet-4-6",
          "cx/gpt-5.6-luna",
        ]
          .map((entry) => entry.trim())
          .filter((entry) => entry !== ""),
      ),
    ).slice(0, 3);

    let lastError: string | null = null;
    let lastContent: string | null = null;

    for (const modelName of candidateModels) {
      try {
        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: ["Bearer", this.config.apiKey].join(" "),
            "User-Agent": "AgenticMarketDesk/1.0",
            // Sebagian gateway (mis. http://localhost:20128/v1) menjawab SSE
            // kecuali klien meminta JSON lewat header Accept.
            Accept: "application/json",
          },
          body: JSON.stringify({
            model: modelName,
            temperature: request.temperature ?? 0.2,
            max_tokens: Math.max(request.maxTokens ?? 1000, 800),
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
          }),
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });

        if (!response.ok) {
          const body = await response.text();
          lastError = `LLM (${modelName}) HTTP ${response.status}: ${body.slice(0, 300)}`;
          continue;
        }

        const bodyText = await response.text();
        const isEventStream =
          (response.headers.get("content-type") ?? "").includes("text/event-stream") ||
          bodyText.trimStart().startsWith("data:");
        const payload: ChatCompletionResponse = isEventStream
          ? { choices: [{ message: { content: collectSseContent(bodyText) } }] }
          : (JSON.parse(bodyText) as ChatCompletionResponse);
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== "string" || content.trim() === "") {
          lastError = `LLM (${modelName}) mengembalikan konten kosong`;
          continue;
        }

        lastContent = content;
        const raw = extractJson(content);
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          lastError = "Respons LLM bukan JSON valid";
          continue;
        }

        const validation = request.schema.safeParse(parsed);
        if (!validation.success) {
          lastError = `Skema respons LLM (${modelName}) tidak cocok: ${validation.error.message}`;
          continue;
        }

        return { data: validation.data, error: null, raw: content, model: modelName };
      } catch (error) {
        lastError = `Panggilan LLM (${modelName}) gagal: ${errorMessage(error)}`;
      }
    }

    return {
      data: null,
      error: lastError ?? "Semua model LLM gagal merespons",
      raw: lastContent,
    };
  }
}
