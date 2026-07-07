import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOllamaEmbeddingProvider } from '../../src/ai/providers/ollama.js'
import { createOpenRouterLlm } from '../../src/ai/providers/openrouter.js'

afterEach(() => vi.unstubAllGlobals())

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('ollama embedding provider', () => {
  it('шлёт model+prompt и возвращает embedding', async () => {
    const fetchMock = mockFetch({ embedding: [0.1, 0.2, 0.3] })
    const provider = createOllamaEmbeddingProvider({ url: 'http://x', model: 'bge-m3' })
    const vec = await provider.embed('текст')
    expect(vec).toEqual([0.1, 0.2, 0.3])
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      model: 'bge-m3',
      prompt: 'текст',
    })
  })
  it('не-ok ответ -> ошибка', async () => {
    mockFetch({}, false, 500)
    const provider = createOllamaEmbeddingProvider({ url: 'http://x', model: 'bge-m3' })
    await expect(provider.embed('t')).rejects.toThrow()
  })
})

describe('openrouter llm provider', () => {
  it('classify возвращает content первого choice', async () => {
    mockFetch({ choices: [{ message: { content: 'сво' } }] })
    const llm = createOpenRouterLlm({ url: 'http://x', apiKey: 'k', model: 'm' })
    expect(await llm.classify({ text: 't', buckets: ['сво'] })).toBe('сво')
  })
  it('rewrite парсит JSON из content', async () => {
    mockFetch({ choices: [{ message: { content: '{"title":"Z","text":"B"}' } }] })
    const llm = createOpenRouterLlm({ url: 'http://x', apiKey: 'k', model: 'm' })
    const r = await llm.rewrite({
      origTitle: 'T',
      origText: 'B',
      sourceLang: 'ru',
      bucket: 'a',
      isSvo: false,
      promptTemplate: null,
    })
    expect(r).toEqual({ title: 'Z', text: 'B' })
  })
})
