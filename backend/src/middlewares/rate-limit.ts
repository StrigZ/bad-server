import rateLimit from 'express-rate-limit'
import {
    AUTH_RATE_LIMIT_MAX,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
} from '../config'

const message = { message: 'Слишком много запросов, попробуйте позже' }

// Общий лимит на все запросы к API (с одного IP за окно времени)
export const apiLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message,
})

// Более строгий лимит на вход и регистрацию (защита от перебора паролей)
export const authLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message,
})
