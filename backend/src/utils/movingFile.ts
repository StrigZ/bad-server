import { access, mkdir, rename } from 'fs/promises'
import { basename, join } from 'path'
import BadRequestError from '../errors/bad-request-error'

// Переносит загруженный файл из временной папки в постоянную.
// basename отбрасывает любые части пути, оставляя только имя файла.
async function movingFile(imagePath: string, from: string, to: string) {
    const fileName = basename(imagePath)
    const imagePathTemp = join(from, fileName)
    const imagePathPermanent = join(to, fileName)

    await mkdir(to, { recursive: true })
    try {
        await access(imagePathTemp)
    } catch {
        throw new BadRequestError('Ошибка при сохранении файла')
    }

    await rename(imagePathTemp, imagePathPermanent)
}

export default movingFile
