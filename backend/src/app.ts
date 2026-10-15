import { errors } from 'celebrate'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { json, urlencoded } from 'express'
import helmet from 'helmet'
import mongoose from 'mongoose'
import {
    DB_ADDRESS,
    ORIGIN_ALLOW,
    PORT,
    PUBLIC_DIR,
    TRUST_PROXY,
} from './config'
import csrfProtection from './middlewares/csrf'
import errorHandler from './middlewares/error-handler'
import { apiLimiter } from './middlewares/rate-limit'
import serveStatic from './middlewares/serverStatic'
import routes from './routes'

const app = express()

// Приложение работает за nginx: берём реальный IP клиента для rate limit
app.set('trust proxy', TRUST_PROXY)
// Простой разбор query-строки: вложенные объекты вида status[$ne]=x не создаются
app.set('query parser', 'simple')

// Заголовки безопасности; скрывает X-Powered-By
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(
    cors({
        origin: ORIGIN_ALLOW.length ? ORIGIN_ALLOW : false,
        credentials: true,
    })
)

// Статика (кэшируется браузером) отдаётся до лимитера и парсеров
app.use(serveStatic(PUBLIC_DIR))

app.use(apiLimiter)
app.use(cookieParser())
app.use(csrfProtection)
app.use(urlencoded({ extended: false, limit: '100kb', parameterLimit: 50 }))
app.use(json({ limit: '100kb' }))

app.use(routes)
app.use(errors())
app.use(errorHandler)

const bootstrap = async () => {
    try {
        await mongoose.connect(DB_ADDRESS)
        app.listen(Number(PORT), () => console.log('ok'))
    } catch (error) {
        console.error(error)
        process.exit(1)
    }
}

// Автозапуск, кроме тестов, которые импортируют app
if (require.main === module) {
    bootstrap()
}

export default app
