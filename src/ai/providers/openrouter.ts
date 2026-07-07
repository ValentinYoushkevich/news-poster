import {
  buildClassifyMessages,
  buildRewriteMessages,
  parseRewriteOutput,
  type ChatMessage,
} from './prompts.js'
import type { LlmProvider, RewriteInput, RewriteResult } from './types.js'

export function createOpenRouterLlm(cfg: {
  url: string
  apiKey: string
  model: string
}): LlmProvider {
  async function chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.3 }),
    })
    if (!res.ok) throw new Error(`openrouter_failed:${res.status}`)
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error('openrouter_no_content')
    return content
  }

  return {
    async classify(input: { text: string; buckets: string[] }): Promise<string> {
      return chat(buildClassifyMessages(input.text, input.buckets))
    },
    async rewrite(input: RewriteInput): Promise<RewriteResult> {
      const content = await chat(buildRewriteMessages(input))
      return parseRewriteOutput(content)
    },
  }
}
