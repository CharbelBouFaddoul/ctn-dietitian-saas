import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "@nutrition-saas/validation";
import type { AiCompletionInput, AiCompletionResult, AiProvider } from "./ai.provider";

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
  error?: { message?: string };
}

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = "openai";

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async complete(input: AiCompletionInput): Promise<AiCompletionResult> {
    const apiKey = this.config.get("AI_API_KEY", { infer: true });
    if (!apiKey) {
      throw new ServiceUnavailableException("AI provider is not configured");
    }
    const model = this.config.get("AI_MODEL", { infer: true });
    const baseUrl = (this.config.get("AI_BASE_URL", { infer: true }) ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const timeoutMs = this.config.get("AI_TIMEOUT_MS", { infer: true });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
          max_tokens: input.maxOutputTokens,
          ...(input.responseFormat === "json" ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });
      const body = (await response.json()) as OpenAiResponse;
      if (!response.ok) {
        throw new ServiceUnavailableException(body.error?.message ?? "AI provider request failed");
      }
      const content = body.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new ServiceUnavailableException("AI provider returned an empty response");
      }
      return {
        content,
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
        model: body.model ?? model,
        provider: this.name,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ServiceUnavailableException("AI provider timed out");
      }
      throw new ServiceUnavailableException("AI provider is unavailable");
    } finally {
      clearTimeout(timer);
    }
  }
}
