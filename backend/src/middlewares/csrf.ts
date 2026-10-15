import crypto from 'crypto'
import { NextFunction, Request, Response } from 'express'
import { REFRESH_TOKEN } from '../config'
import ForbiddenError from '../errors/forbidden-error'

export const CSRF_COOKIE = 'csrfToken'
export const CSRF_HEADER = 'x-csrf-token'

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS']
// Вход и регистрация выполняются до появления токена (cookie ещё нет)
const EXEMPT_PATHS = ['/auth/login', '/auth/register']

const cookieOptions = { ...REFRESH_TOKEN.cookie.options, httpOnly: false }

// Выдаёт новый случайный CSRF-токен в cookie (читается JS-кодом интерфейса)
export const issueCsrfToken = (res: Response) => {
    res.cookie(CSRF_COOKIE, crypto.randomBytes(32).toString('hex'), cookieOptions)
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
    if (SAFE_METHODS.includes(req.method) || EXEMPT_PATHS.includes(req.path)) {
        return next()
    }
    const cookieToken = req.cookies?.[CSRF_COOKIE]
    const headerToken = req.header(CSRF_HEADER)
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
