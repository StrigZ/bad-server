import { open, readFile } from 'fs/promises'

const SIGNATURES = new Map<string, number[]>([
    ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ['image/jpeg', [0xff, 0xd8, 0xff]],
    ['image/jpg', [0xff, 0xd8, 0xff]],
    ['image/gif', [0x47, 0x49, 0x46, 0x38]],
])

// В SVG не должно быть скриптов и обработчиков событий
const UNSAFE_SVG = /<script|<foreignObject|\son[a-z]+\s*=|javascript:/i

// Проверяет, что содержимое файла соответствует заявленному типу изображения
export default async function hasValidFileContent(
    filePath: string,
    mimetype: string
): Promise<boolean> {
    if (mimetype === 'image/svg+xml') {
        const content = await readFile(filePath, 'utf8')
        return /<svg[\s>]/i.test(content) && !UNSAFE_SVG.test(content)
    }

    const signature = SIGNATURES.get(mimetype)
    if (!signature) {
        return false
    }

    const handle = await open(filePath, 'r')
    try {
        const buffer = Buffer.alloc(signature.length)
        await handle.read(buffer, 0, signature.length, 0)
        return signature.every((byte, index) => buffer[index] === byte)
    } finally {
        await handle.close()
    }
}
