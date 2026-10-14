// Простой кэш в памяти с временем жизни записей и ограничением числа записей
export default class TtlCache<T> {
    private store = new Map<string, { value: T; expiresAt: number }>()

    private ttlMs: number

    private maxEntries: number

    constructor(ttlMs: number, maxEntries = 200) {
        this.ttlMs = ttlMs
        this.maxEntries = maxEntries
    }

    get(key: string): T | undefined {
        const entry = this.store.get(key)
        if (!entry) {
            return undefined
        }
        if (entry.expiresAt < Date.now()) {
            this.store.delete(key)
            return undefined
        }
        return entry.value
    }

    set(key: string, value: T): void {
        if (this.store.size >= this.maxEntries) {
            const oldestKey = this.store.keys().next().value
            if (oldestKey !== undefined) {
                this.store.delete(oldestKey)
            }
        }
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs })
    }

    clear(): void {
        this.store.clear()
    }
}
