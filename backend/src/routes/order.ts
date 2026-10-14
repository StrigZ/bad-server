import { Router } from 'express'
import {
    createOrder,
    deleteOrder,
    getOrderByNumber,
    getOrderCurrentUserByNumber,
    getOrders,
    getOrdersCurrentUser,
    updateOrder,
} from '../controllers/order'
import { roleGuardMiddleware } from '../middlewares/auth'
import {
    validateIdParam,
    validateMyOrdersQuery,
    validateOrderBody,
    validateOrderNumberParam,
    validateOrderUpdateBody,
    validateOrdersQuery,
} from '../middlewares/validations'
import { Role } from '../models/user'

// auth подключён в routes/index.ts
const orderRouter = Router()

orderRouter.post('/', validateOrderBody, createOrder)
orderRouter.get(
    '/all',
    roleGuardMiddleware(Role.Admin),
    validateOrdersQuery,
    getOrders
)
orderRouter.get('/all/me', validateMyOrdersQuery, getOrdersCurrentUser)
orderRouter.get(
    '/:orderNumber',
    roleGuardMiddleware(Role.Admin),
    validateOrderNumberParam,
    getOrderByNumber
)
orderRouter.get(
    '/me/:orderNumber',
    validateOrderNumberParam,
    getOrderCurrentUserByNumber
)
orderRouter.patch(
    '/:orderNumber',
    roleGuardMiddleware(Role.Admin),
    validateOrderNumberParam,
    validateOrderUpdateBody,
    updateOrder
)

orderRouter.delete(
    '/:id',
    roleGuardMiddleware(Role.Admin),
    validateIdParam,
    deleteOrder
)

export default orderRouter
