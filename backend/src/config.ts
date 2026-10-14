import 'dotenv/config'
import crypto from 'crypto'
import { CookieOptions } from 'express'
import ms from 'ms'
import path from 'path'

export const { PORT = '3000' } = process.env
export const { DB_ADDRESS = 'mongodb://127.0.0.1:27017/weblarek' } = process.env

export const PUBLIC_DIR = path.join(__dirname, 'public')
export const UPLOAD_PATH = process.env.UPLOAD_PATH ?? ''
export const UPLOAD_PATH_TEMP = process.env.UPLOAD_PATH_TEMP ?? ''

// Секреты берутся только из окружения. Если переменная не задана, генерируется
// случайный секрет на время жизни процесса: известного заранее значения по умолчанию нет,
// поэтому подделать токен нельзя (но после перезапуска токены перестанут действовать).
const getSecret = (name: string): string => {
    const value = process.env[name]
    if (value) {
        return value
    }
    // eslint-disable-next-line no-console
    console.warn(`[config] ${name} не задан, используется временный случайный секрет`)
    return crypto.randomBytes(32).toString('hex')
}

export const ACCESS_TOKEN = {
    secret: getSecret('AUTH_ACCESS_TOKEN_SECRET'),
    expiry: process.env.AUTH_ACCESS_TOKEN_EXPIRY || '10m',
}

export const REFRESH_TOKEN = {
    secret: getSecret('AUTH_REFRESH_TOKEN_SECRET'),
    expiry: process.env.AUTH_REFRESH_TOKEN_EXPIRY || '7d',
    cookie: {
        name: 'refreshToken',
        options: {
            httpOnly: true,
            // strict: cookie не уходит на запросы, инициированные с чужих сайтов (защита от CSRF
            // для /auth/token и /auth/logout)
            sameSite: 'strict',
            // для https-окружения задайте COOKIE_SECURE=true
            secure: process.env.COOKIE_SECURE === 'true',
            maxAge: ms(process.env.AUTH_REFRESH_TOKEN_EXPIRY || '7d'),
            path: '/',
        } as CookieOptions,
    },
}

// Разрешённые источники для CORS через запятую. Если не задано, CORS выключен
// (интерфейс и API работают на одном домене через nginx).
export const ORIGIN_ALLOW = (process.env.ORIGIN_ALLOW ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

// Количество прокси перед приложением (nginx = 1), нужно для корректного IP в rate limit
const trustProxy = Number(process.env.TRUST_PROXY ?? 1)
export const TRUST_PROXY = Number.isNaN(trustProxy) ? 1 : trustProxy

export const RATE_LIMIT_WINDOW_MS = 60 * 1000
export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 100
export const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX) || 20
