import { describe, expect, it } from 'vitest'
import { cutReadMoreTail, extractFirstImgSrc, stripHtml } from '../../src/normalize/html.js'

describe('stripHtml', () => {
  it('удаляет теги и схлопывает пробелы', () => {
    expect(stripHtml('<p>Привет  <b>мир</b></p>')).toBe('Привет мир')
  })
  it('декодирует базовые сущности', () => {
    expect(stripHtml('a &amp; b &lt;c&gt;')).toBe('a & b <c>')
  })
  it('пустой/undefined -> пустая строка', () => {
    expect(stripHtml(undefined)).toBe('')
    expect(stripHtml('')).toBe('')
  })
})

describe('cutReadMoreTail', () => {
  it('срезает "Continue reading..."', () => {
    expect(cutReadMoreTail('Текст новости. Continue reading...')).toBe('Текст новости.')
  })
  it('срезает "Читать далее"', () => {
    expect(cutReadMoreTail('Событие произошло. Читать далее')).toBe('Событие произошло.')
  })
  it('без хвоста возвращает как есть', () => {
    expect(cutReadMoreTail('Просто текст')).toBe('Просто текст')
  })
})

describe('extractFirstImgSrc', () => {
  it('достаёт src первой картинки', () => {
    expect(extractFirstImgSrc('<p>x</p><img src="https://a/b.jpg"> y')).toBe('https://a/b.jpg')
  })
  it('нет картинки -> null', () => {
    expect(extractFirstImgSrc('<p>no image</p>')).toBeNull()
  })
})
