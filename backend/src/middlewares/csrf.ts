import crypto from 'crypto'
import { NextFunction, Request, Response } from 'express'
import { REFRESH_TOKEN } from '../config'
import ForbiddenError from '../errors/forbidden-error'

export const CSRF_COOKIE = '_csrf'
// Допустимые имена заголовка, в котором клиент присылает токен
export const CSRF_HEADERS = [
    'x-csrf-token',
    'csrf-token',
    'x-xsrf-token',
    'xsrf-token',
]

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS']
const cookieOptions = { ...REFRESH_TOKEN.cookie.options, httpOnly: false }

// Выдаёт CSRF-токен в cookie (читается JS-кодом интерфейса). Если у клиента уже есть
// корректный токен, он сохраняется: токен не меняется при входе и обновлении токена,
// поэтому ранее полученное значение остаётся действительным.
export const issueCsrfToken = (req: Request, res: Response): string => {
    const existing = req.cookies?.[CSRF_COOKIE]
    const token =
        typeof existing === 'string' && /^[0-9a-f]{64}$/.test(existing)
            ? existing
            : crypto.randomBytes(32).toString('hex')
    res.cookie(CSRF_COOKIE, token, cookieOptions)
    return token
}

export const clearCsrfToken = (res: Response) => {
    res.cookie(CSRF_COOKIE, '', { ...cookieOptions, maxAge: -1 })
}

const isEqual = (a: string, b: string) => {
    const bufferA = Buffer.from(a)
    const bufferB = Buffer.from(b)
    return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB)
}

// Double submit cookie: значение из cookie должно совпасть со значением в заголовке.
// Чужой сайт не может ни прочитать cookie, ни выставить свой заголовок.
const csrfProtection = (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE_METHODS.includes(req.method)) {
        return next()
    }
    const cookieToken = req.cookies?.[CSRF_COOKIE]
    const headerToken = CSRF_HEADERS.map((name) => req.header(name)).find(
        (value) => typeof value === 'string' && value.length > 0
    )
    if (
        typeof cookieToken !== 'string' ||
        typeof headerToken !== 'string' ||
        cookieToken.length === 0 ||
        !isEqual(cookieToken, headerToken)
    ) {
        return next(new ForbiddenError('Недействительный CSRF-токен'))
    }
    return next()
}

export default csrfProtection
