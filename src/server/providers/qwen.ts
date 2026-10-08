import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";

/** The model is an external boundary; application code validates all returned JSON. */
export interface JsonModel {
  complete(
    input: {
      instructions: string;
      data: unknown;
      repair?: string;
      maxTokens: number;
    },
    signal: AbortSignal,
  ): Promise<string>;
}
export class QwenModel implements JsonModel {
  private client: OpenAI;
  constructor(
    private config: {
      key: string;
      baseUrl: string;
      model: string;
      timeoutMs: number;
    },
  ) {
    this.client = new OpenAI({
      apiKey: config.key || "unconfigured",
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
      maxRetries: 0,
    });
  }
  async complete(
    input: {
      instructions: string;
      data: unknown;
      repair?: string;
      maxTokens: number;
    },
    signal: AbortSignal,
  ): Promise<string> {
    if (!this.config.key || !this.config.model)
      throw new Error("AI_UNCONFIGURED");
    const body: ChatCompletionCreateParamsNonStreaming & {
      enable_thinking: boolean;
    } = {
      model: this.config.model,
      enable_thinking: false,
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: input.maxTokens,
      messages: [
        { role: "system", content: input.instructions },
        { role: "user", content: JSON.stringify({ data: input.data }) },
        ...(input.repair
          ? [
              {
                role: "user" as const,
                content: `Your previous JSON failed validation: ${input.repair}. Return a corrected full JSON object using the same input data and schema.`,
              },
            ]
          : []),
      ],
    };
    const result = await this.client.chat.completions.create(body, {
      signal,
      maxRetries: 0,
    });
    const choice = result.choices[0];
    if (!choice || choice.finish_reason !== "stop" || !choice.message.content)
      throw new Error("AI_INCOMPLETE");
    return choice.message.content;
  }
}
