// Qis AI Providers
// Provider-Independent interface for LLM-based strategy generation.
// Business logic must never depend directly on OpenAI/Anthropic/Gemini.
// These providers are used by AiEngine to generate explainable strategy
// recommendations, with heuristic fallback when no API key is configured.

export interface AiProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface AiProviderRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiProviderResponse {
  text: string;
  provider: 'openai' | 'anthropic' | 'gemini';
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface AiProvider {
  readonly name: 'openai' | 'anthropic' | 'gemini';
  isConfigured(): boolean;
  generate(request: AiProviderRequest): Promise<AiProviderResponse>;
}

// ============================================================
// OpenAI Provider
// ============================================================

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: AiProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = config.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(request: AiProviderRequest): Promise<AiProviderResponse> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      provider: 'openai',
      model: this.model,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}

// ============================================================
// Anthropic Provider
// ============================================================

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic' as const;
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: AiProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.model = config.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022';
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com/v1';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(request: AiProviderRequest): Promise<AiProviderResponse> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key is not configured');
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.userPrompt }],
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    return {
      text: data.content?.[0]?.text ?? '',
      provider: 'anthropic',
      model: this.model,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
    };
  }
}

// ============================================================
// Gemini Provider
// ============================================================

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: AiProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.GEMINI_API_KEY;
    this.model = config.model ?? process.env.GEMINI_MODEL ?? 'gemini-1.5-pro';
    this.baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(request: AiProviderRequest): Promise<AiProviderResponse> {
    if (!this.apiKey) {
      throw new Error('Gemini API key is not configured');
    }

    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${request.systemPrompt}\n\n${request.userPrompt}` },
            ],
          },
        ],
        generationConfig: {
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? 2000,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    return {
      text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
      provider: 'gemini',
      model: this.model,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}

// ============================================================
// Provider Factory
// ============================================================

export type AiProviderName = 'openai' | 'anthropic' | 'gemini';

/**
 * Creates an AI provider based on the configured environment.
 * Priority: OPENAI_API_KEY > ANTHROPIC_API_KEY > GEMINI_API_KEY
 * Returns null if no provider is configured.
 */
export function createAiProvider(): AiProvider | null {
  const openai = new OpenAiProvider();
  if (openai.isConfigured()) return openai;

  const anthropic = new AnthropicProvider();
  if (anthropic.isConfigured()) return anthropic;

  const gemini = new GeminiProvider();
  if (gemini.isConfigured()) return gemini;

  return null;
}

/**
 * Creates a specific AI provider by name.
 * Throws if the provider is not configured.
 */
export function createNamedAiProvider(name: AiProviderName): AiProvider {
  switch (name) {
    case 'openai':
      return new OpenAiProvider();
    case 'anthropic':
      return new AnthropicProvider();
    case 'gemini':
      return new GeminiProvider();
    default:
      throw new Error(`Unknown AI provider: ${name}`);
  }
}