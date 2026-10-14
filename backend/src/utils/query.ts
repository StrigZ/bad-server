import { MAX_PAGE, MAX_PAGE_SIZE } from '../constants/query'

// Значение query-параметра после валидации: строка или число (Joi приводит типы)
export type QueryValue = string | number | undefined

export const isPresent = (value: unknown): value is string | number =>
    value !== undefined && value !== null && value !== ''

export const getPagination = (
    pageValue: unknown,
    limitValue: unknown,
    defaultLimit: number
) => {
    const page = Math.min(MAX_PAGE, Math.max(1, Math.floor(Number(pageValue)) || 1))
    const limit = Math.min(
        MAX_PAGE_SIZE,
        Math.max(1, Math.floor(Number(limitValue)) || defaultLimit)
    )
    return { page, limit, skip: (page - 1) * limit }
}
