export const ORDER_SORT_FIELDS = [
    'createdAt',
    'totalAmount',
    'orderNumber',
    'status',
] as const

export const CUSTOMER_SORT_FIELDS = [
    'createdAt',
    'lastOrderDate',
    'totalAmount',
    'orderCount',
    'name',
] as const

export const MAX_PAGE = 100000
export const MAX_PAGE_SIZE = 100
export const MAX_SEARCH_LENGTH = 100
