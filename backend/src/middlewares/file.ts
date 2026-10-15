import crypto from 'crypto'
import { Express, Request } from 'express'
import { mkdirSync } from 'fs'
import multer, { FileFilterCallback } from 'multer'
import { join } from 'path'
import { PUBLIC_DIR, UPLOAD_PATH_TEMP } from '../config'

type DestinationCallback = (error: Error | null, destination: string) => void
type FileNameCallback = (error: Error | null, filename: string) => void

// Допустимые типы файлов и расширения, которые сервер выбирает сам
const EXTENSIONS = new Map<string, string>([
    ['image/png', '.png'],
    ['image/jpg', '.jpg'],
    ['image/jpeg', '.jpg'],
    ['image/gif', '.gif'],
    ['image/svg+xml', '.svg'],
])

const MAX_FILE_SIZE = 5 * 1024 * 1024

const storage = multer.diskStorage({
    destination: (
        _req: Request,
        _file: Express.Multer.File,
        cb: DestinationCallback
    ) => {
        const destinationPath = join(PUBLIC_DIR, UPLOAD_PATH_TEMP)

        mkdirSync(destinationPath, { recursive: true })

        cb(null, destinationPath)
    },

    // Имя файла генерируется на сервере: имя от клиента не используется,
    // поэтому файл нельзя ни записать в чужую папку, ни перезаписать существующий
    filename: (
        _req: Request,
        file: Express.Multer.File,
        cb: FileNameCallback
    ) => {
        cb(null, `${crypto.randomUUID()}${EXTENSIONS.get(file.mimetype)}`)
    },
})

const fileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
) => {
    if (!EXTENSIONS.has(file.mimetype)) {
        return cb(null, false)
    }

    return cb(null, true)
}

export default multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 5 },
})
