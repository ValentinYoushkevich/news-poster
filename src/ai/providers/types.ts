export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
}

export interface RewriteInput {
  origTitle: string
  origText: string
  sourceLang: string
  bucket: string
  isSvo: boolean
  promptTemplate?: string | null
}

export interface RewriteResult {
  title: string
  text: string
}

export interface LlmProvider {
  classify(input: { text: string; buckets: string[] }): Promise<string>
  rewrite(input: RewriteInput): Promise<RewriteResult>
}

export interface WorkerDeps {
  embedding: EmbeddingProvider
  llm: LlmProvider
}
