import { resolve, sep } from 'path'

// Склеивает базовую директорию и относительный путь. Возвращает null, если результат
// выходит за пределы базовой директории (защита от path traversal).
export default function safeJoin(baseDir: string, relativePath: string): string | null {
    const base = resolve(baseDir)
    const target = resolve(base, relativePath.replace(/^[/\\]+/, ''))
    if (target === base || !target.startsWith(base + sep)) {
        return null
    }
    return target
}
