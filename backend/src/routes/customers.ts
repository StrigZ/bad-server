import { Router } from 'express'
import {
    deleteCustomer,
    getCustomerById,
    getCustomers,
    updateCustomer,
} from '../controllers/customers'
import {
    validateCustomersQuery,
    validateIdParam,
    validateUserUpdateBody,
} from '../middlewares/validations'

// auth и проверка роли администратора подключены в routes/index.ts
const customerRouter = Router()

customerRouter.get('/', validateCustomersQuery, getCustomers)
customerRouter.get('/:id', validateIdParam, getCustomerById)
customerRouter.patch(
    '/:id',
    validateIdParam,
    validateUserUpdateBody,
    updateCustomer
)
customerRouter.delete('/:id', validateIdParam, deleteCustomer)

export default customerRouter
