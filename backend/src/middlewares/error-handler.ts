import { ErrorRequestHandler } from 'express'
import { MulterError } from 'multer'

const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
    if (res.headersSent) {
        return next(err)
    }

    let statusCode = 500
    let message = 'На сервере произошла ошибка'

    if (err instanceof MulterError) {
        statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
        message =
            err.code === 'LIMIT_FILE_SIZE'
                ? 'Файл слишком большой'
                : 'Ошибка при загрузке файла'
    } else {
        const { statusCode: errorStatus } = err as { statusCode?: number }
        // Текст ошибки отдаётся клиенту только для ожидаемых (4xx) ошибок
        if (typeof errorStatus === 'number' && errorStatus >= 400 && errorStatus < 500) {
            statusCode = errorStatus
            message = (err as Error).message
        }
    }

    if (statusCode >= 500) {
        // Внутренние детали остаются только в логе сервера
        console.error(err)
    }

    return res.status(statusCode).send({ message })
}

export default errorHandler
