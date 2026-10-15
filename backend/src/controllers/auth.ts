import crypto from 'crypto'
import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { Error as MongooseError } from 'mongoose'
import { REFRESH_TOKEN } from '../config'
import BadRequestError from '../errors/bad-request-error'
import ConflictError from '../errors/conflict-error'
import NotFoundError from '../errors/not-found-error'
import UnauthorizedError from '../errors/unauthorized-error'
import { clearCsrfToken, issueCsrfToken } from '../middlewares/csrf'
import User from '../models/user'
import { isDuplicateKeyError } from '../utils/mongo-errors'
import pick from '../utils/pick'

interface UserUpdateBody {
    name?: string
    email?: string
    phone?: string
}

// Поля профиля, которые пользователь может менять сам
const UPDATABLE_FIELDS = ['name', 'email', 'phone'] as const

// GET /auth/csrf-token
// Выдаёт CSRF-токен: он кладётся в cookie и возвращается в теле ответа.
// Клиент присылает его в заголовке X-CSRF-Token со всеми запросами, меняющими данные
// (в том числе перед входом и регистрацией).
const getCsrfToken = (req: Request, res: Response) => {
    const csrfToken = issueCsrfToken(req, res)
    res.json({ csrfToken })
}

// POST /auth/login
const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body
        const user = await User.findUserByCredentials(email, password)
        const accessToken = user.generateAccessToken()
        const refreshToken = await user.generateRefreshToken()
        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        )
        issueCsrfToken(req, res)
        return res.json({
            success: true,
            user,
            accessToken,
        })
    } catch (err) {
        return next(err)
    }
}

// POST /auth/register
const register = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password, name } = req.body
        const newUser = new User({ email, password, name })
        await newUser.save()
        const accessToken = newUser.generateAccessToken()
        const refreshToken = await newUser.generateRefreshToken()

        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        )
        issueCsrfToken(req, res)
        return res.status(constants.HTTP_STATUS_CREATED).json({
            success: true,
            user: newUser,
            accessToken,
        })
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        if (isDuplicateKeyError(error)) {
            return next(
                new ConflictError('Пользователь с таким email уже существует')
            )
        }
        return next(error)
    }
}

// GET /auth/user
const getCurrentUser = async (
    _req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = res.locals.user._id
        const user = await User.findById(userId).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        )
        res.json({ user, success: true })
    } catch (error) {
        next(error)
    }
}

// Удаляет использованный refresh токен пользователя и возвращает пользователя
const deleteRefreshTokenInUser = async (req: Request) => {
    const { cookies } = req
    const rfTkn = cookies[REFRESH_TOKEN.cookie.name]

    if (!rfTkn || typeof rfTkn !== 'string') {
        throw new UnauthorizedError('Не валидный токен')
    }

    let decodedRefreshTkn: JwtPayload
    try {
        decodedRefreshTkn = jwt.verify(rfTkn, REFRESH_TOKEN.secret, {
            algorithms: ['HS256'],
        }) as JwtPayload
    } catch {
        throw new UnauthorizedError('Не валидный токен')
    }

    if (typeof decodedRefreshTkn._id !== 'string') {
        throw new UnauthorizedError('Не валидный токен')
    }

    const user = await User.findOne({
        _id: decodedRefreshTkn._id,
    }).orFail(() => new UnauthorizedError('Пользователь не найден в базе'))

    const rTknHash = crypto
        .createHmac('sha256', REFRESH_TOKEN.secret)
        .update(rfTkn)
        .digest('hex')

    user.tokens = user.tokens.filter((tokenObj) => tokenObj.token !== rTknHash)

    await user.save()

    return user
}

// POST /auth/logout
const logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await deleteRefreshTokenInUser(req)
        const expireCookieOptions = {
            ...REFRESH_TOKEN.cookie.options,
            maxAge: -1,
        }
        res.cookie(REFRESH_TOKEN.cookie.name, '', expireCookieOptions)
        clearCsrfToken(res)
        res.status(200).json({
            success: true,
        })
    } catch (error) {
        next(error)
    }
}

// POST /auth/token
const refreshAccessToken = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userWithRefreshTkn = await deleteRefreshTokenInUser(req)
        const accessToken = userWithRefreshTkn.generateAccessToken()
        const refreshToken = await userWithRefreshTkn.generateRefreshToken()
        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        )
        issueCsrfToken(req, res)
        return res.json({
            success: true,
            user: userWithRefreshTkn,
            accessToken,
        })
    } catch (error) {
        return next(error)
    }
}

// GET /auth/user/roles
// Пользователь уже загружен из базы в мидлваре auth, повторный запрос не нужен
const getCurrentUserRoles = (
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    res.status(200).json(res.locals.user.roles)
}

// PATCH /auth/me
const updateCurrentUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id
    try {
        // Только разрешённые поля: roles, tokens, password и операторы Mongo сюда не попадают
        const update = pick(req.body as UserUpdateBody, UPDATABLE_FIELDS)
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: update },
            { new: true, runValidators: true }
        ).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        )
        res.status(200).json(updatedUser)
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        if (isDuplicateKeyError(error)) {
            return next(
                new ConflictError('Пользователь с таким email уже существует')
            )
        }
        return next(error)
    }
}

export {
    getCsrfToken,
    getCurrentUser,
    getCurrentUserRoles,
    login,
    logout,
    refreshAccessToken,
    register,
    updateCurrentUser,
}
