import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'

const app = createApp()

const savedLogin = process.env.ADMIN_LOGIN
const savedPassword = process.env.ADMIN_PASSWORD

beforeEach(() => {
  process.env.ADMIN_LOGIN = 'admin'
  process.env.ADMIN_PASSWORD = 'secret'
})

afterEach(() => {
  process.env.ADMIN_LOGIN = savedLogin
  process.env.ADMIN_PASSWORD = savedPassword
})

async function loginCookie(): Promise<string> {
  const res = await request(app)
    .post('/auth/login')
    .send({ login: 'admin', password: 'secret' })
  return res.headers['set-cookie']![0].split(';')[0]
}

describe('POST /auth/login', () => {
  it('200 и httpOnly-cookie при верных кредах', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ login: 'admin', password: 'secret' })
    expect(res.status).toBe(200)
    expect(res.body.login).toBe('admin')
    const cookie = res.headers['set-cookie']![0]
    expect(cookie).toContain('admin_session=')
    expect(cookie.toLowerCase()).toContain('httponly')
  })

  it('401 при неверном пароле', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ login: 'admin', password: 'wrong' })
    expect(res.status).toBe(401)
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('401 при нестроковых полях', async () => {
    const res = await request(app).post('/auth/login').send({ login: 1, password: null })
    expect(res.status).toBe(401)
  })
})

describe('GET /auth/check', () => {
  it('401 без cookie', async () => {
    const res = await request(app).get('/auth/check')
    expect(res.status).toBe(401)
  })

  it('200 с валидной сессией', async () => {
    const cookie = await loginCookie()
    const res = await request(app).get('/auth/check').set('Cookie', cookie)
    expect(res.status).toBe(200)
  })

  it('401 с мусорным токеном', async () => {
    const res = await request(app).get('/auth/check').set('Cookie', 'admin_session=fake')
    expect(res.status).toBe(401)
  })

  it('200 когда креды не заданы (auth выключен)', async () => {
    delete process.env.ADMIN_LOGIN
    delete process.env.ADMIN_PASSWORD
    const res = await request(app).get('/auth/check')
    expect(res.status).toBe(200)
  })
})

describe('GET /auth/me', () => {
  it('401 без сессии', async () => {
    const res = await request(app).get('/auth/me')
    expect(res.status).toBe(401)
  })

  it('возвращает логин с сессией', async () => {
    const cookie = await loginCookie()
    const res = await request(app).get('/auth/me').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ login: 'admin', authRequired: true })
  })

  it('authRequired=false когда креды не заданы', async () => {
    delete process.env.ADMIN_LOGIN
    delete process.env.ADMIN_PASSWORD
    const res = await request(app).get('/auth/me')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ login: null, authRequired: false })
  })
})

describe('POST /auth/logout', () => {
  it('гасит сессию: после логаута /auth/check отдаёт 401', async () => {
    const cookie = await loginCookie()
    const out = await request(app).post('/auth/logout').set('Cookie', cookie)
    expect(out.status).toBe(204)
    const check = await request(app).get('/auth/check').set('Cookie', cookie)
    expect(check.status).toBe(401)
  })
})
