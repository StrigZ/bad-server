import { NextFunction, Request, Response } from 'express'
import { unlink } from 'fs/promises'
import { constants } from 'http2'
import { UPLOAD_PATH } from '../config'
import BadRequestError from '../errors/bad-request-error'
import hasValidFileContent from '../utils/file-signature'
import { sanitizeText } from '../utils/sanitize'

export const uploadFile = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!req.file) {
        return next(new BadRequestError('Файл не загружен'))
    }
    try {
        // Тип из заголовка запроса задаёт клиент, поэтому проверяем само содержимое файла
        const isValid = await hasValidFileContent(
            req.file.path,
            req.file.mimetype
        )
        if (!isValid) {
            await unlink(req.file.path).catch(() => undefined)
            return next(
                new BadRequestError(
                    'Содержимое файла не соответствует типу изображения'
                )
            )
        }

        const fileName = UPLOAD_PATH
            ? `/${UPLOAD_PATH}/${req.file.filename}`
            : `/${req.file.filename}`
        return res.status(constants.HTTP_STATUS_CREATED).send({
            fileName,
            originalName: sanitizeText(req.file.originalname),
        })
    } catch (error) {
        return next(error)
    }
}

export default {}
