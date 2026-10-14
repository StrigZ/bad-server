import express, { Response } from 'express'
import path from 'path'

// Раздача статики через express.static: он сам не выпускает запросы за пределы baseDir
// (path traversal), игнорирует dot-файлы и поддерживает кэширование (ETag, Cache-Control).
export default function serveStatic(baseDir: string) {
    return express.static(baseDir, {
        dotfiles: 'ignore',
        index: false,
        redirect: false,
        maxAge: '1d',
        setHeaders: (res: Response, filePath: string) => {
            res.setHeader('X-Content-Type-Options', 'nosniff')
            if (path.extname(filePath).toLowerCase() === '.svg') {
                // SVG при открытии напрямую не должен выполнять скрипты
                res.setHeader(
                    'Content-Security-Policy',
                    "default-src 'none'; style-src 'unsafe-inline'; sandbox"
                )
            }
        },
    })
}
