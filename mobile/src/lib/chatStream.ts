import { fetch } from 'expo/fetch';
import { SUPABASE_FUNCTIONS_URL } from './supabase';

// Mirrors src/components/AIChatWidget.tsx:219-284 in the web app.
// The chat edge function emits OpenAI-style SSE: lines beginning with
// "data: " carry a JSON payload whose choices[0].delta.content holds the
// next chunk of assistant text. "data: [DONE]" terminates the stream.

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export class ChatDailyLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatDailyLimitError';
  }
}

interface StreamOptions {
  messages: ChatMessage[];
  skill: string;
  accessToken: string;
  signal?: AbortSignal;
}

/**
 * Yields each new assistant content chunk as it arrives.
 * Throws ChatDailyLimitError on 429, generic Error on other failures.
 */
export async function* streamChat({
  messages,
  skill,
  accessToken,
  signal,
}: StreamOptions): AsyncGenerator<string, void, unknown> {
  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ messages, skill }),
    signal,
  });

  if (!response.ok) {
    let errBody: { error?: string; message?: string } = {};
    try {
      errBody = (await response.json()) as typeof errBody;
    } catch {
      // body wasn't JSON
    }
    if (response.status === 429 && errBody.error === 'daily_limit_reached') {
      throw new ChatDailyLimitError(
        errBody.message ??
          "You've used all your free expert messages today. Upgrade to Flare+ for unlimited access."
      );
    }
    throw new Error(errBody.error ?? errBody.message ?? `HTTP ${response.status}`);
  }

  if (!response.body) throw new Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':') || line.trim() === '') continue;
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (json === '[DONE]') return;
      try {
        const parsed = JSON.parse(json) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // partial JSON — push back onto buffer so the next read completes it
        buffer = line + '\n' + buffer;
        break;
      }
    }
  }
}
