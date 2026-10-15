// Возвращает объект только с перечисленными ключами (и только если значение задано)
export default function pick<T extends object, K extends keyof T>(
    source: T,
    keys: readonly K[]
): Partial<Pick<T, K>> {
    const result: Partial<Pick<T, K>> = {}
    keys.forEach((key) => {
        if (source[key] !== undefined) {
            result[key] = source[key]
        }
    })
    return result
}
