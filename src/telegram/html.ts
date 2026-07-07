export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const CAPTION_LIMIT = 1024

// <b>заголовок</b>\n\nтело из экранированных частей, с лимитом caption ≤ 1024.
// При переполнении режем СЫРОЙ текст посимвольно, затем экранируем — так обрезка
// никогда не рвёт HTML-сущность посередине (напр. &amp;).
export function buildCaption(finalTitle: string, finalText: string): string {
  const title = (finalTitle ?? '').trim()
  const text = (finalText ?? '').trim()
  const titleHtml = title ? `<b>${escapeHtml(title)}</b>` : ''
  const glue = titleHtml && text ? '\n\n' : ''

  let caption = titleHtml + glue + escapeHtml(text)
  if (caption.length > CAPTION_LIMIT) {
    let body = text
    while ((titleHtml + glue + escapeHtml(body) + '…').length > CAPTION_LIMIT && body.length > 0) {
      body = body.slice(0, -1)
    }
    caption = titleHtml + glue + escapeHtml(body) + '…'
  }
  return caption
}
