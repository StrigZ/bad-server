import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { Types } from 'mongoose'
import { ACCESS_TOKEN } from '../config'
import ForbiddenError from '../errors/forbidden-error'
import UnauthorizedError from '../errors/unauthorized-error'
import UserModel, { Role } from '../models/user'

const BEARER_PREFIX = 'Bearer '

// Проверка JWT. Все ошибки передаются в next, поэтому процесс не падает
// от необработанного отклонения промиса (запрос без заголовка и т.п.)
const auth = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.header('Authorization')
    if (!authHeader?.startsWith(BEARER_PREFIX)) {
        return next(new UnauthorizedError('Невалидный токен'))
    }

    try {
        const accessToken = authHeader.slice(BEARER_PREFIX.length)
        const payload = jwt.verify(accessToken, ACCESS_TOKEN.secret, {
            algorithms: ['HS256'],
        })

        if (
            typeof payload === 'string' ||
            typeof payload.sub !== 'string' ||
            !Types.ObjectId.isValid(payload.sub)
        ) {
            return next(new UnauthorizedError('Невалидный токен'))
        }

        const user = await UserModel.findById(payload.sub, {
            password: 0,
            tokens: 0,
        })

        if (!user) {
            return next(new ForbiddenError('Нет доступа'))
        }
        res.locals.user = user

        return next()
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return next(new UnauthorizedError('Истек срок действия токена'))
        }
        if (error instanceof jwt.JsonWebTokenError) {
            return next(new UnauthorizedError('Необходима авторизация'))
        }
        return next(error)
    }
}

export function roleGuardMiddleware(...roles: Role[]) {
    return (_req: Request, res: Response, next: NextFunction) => {
        if (!res.locals.user) {
            return next(new UnauthorizedError('Необходима авторизация'))
        }

        const hasAccess = roles.some((role) =>
            res.locals.user.roles.includes(role)
        )

        if (!hasAccess) {
            return next(new ForbiddenError('Доступ запрещен'))
        }

        return next()
    }
}

export default auth
