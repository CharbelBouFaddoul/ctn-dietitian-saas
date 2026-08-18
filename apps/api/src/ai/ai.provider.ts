export const AI_PROVIDER = "AI_PROVIDER";

export interface AiCompletionInput {
  system: string;
  user: string;
  maxOutputTokens: number;
  responseFormat?: "json" | "text";
}

export interface AiCompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
}

export interface AiProvider {
  readonly name: string;
  complete(input: AiCompletionInput): Promise<AiCompletionResult>;
}
