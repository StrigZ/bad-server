import { NextFunction, Request, Response } from 'express'
import { FilterQuery, Error as MongooseError, SortOrder } from 'mongoose'
import { CUSTOMER_SORT_FIELDS, MAX_LIST_PAGE_SIZE } from '../constants/query'
import BadRequestError from '../errors/bad-request-error'
import ConflictError from '../errors/conflict-error'
import NotFoundError from '../errors/not-found-error'
import Order from '../models/order'
import User, { IUser } from '../models/user'
import escapeRegExp from '../utils/escapeRegExp'
import { isDuplicateKeyError } from '../utils/mongo-errors'
import pick from '../utils/pick'
import { QueryValue, getPagination, isPresent } from '../utils/query'

interface CustomersQuery {
    page?: QueryValue
    limit?: QueryValue
    sortField?: QueryValue
    sortOrder?: QueryValue
    registrationDateFrom?: QueryValue
    registrationDateTo?: QueryValue
    lastOrderDateFrom?: QueryValue
    lastOrderDateTo?: QueryValue
    totalAmountFrom?: QueryValue
    totalAmountTo?: QueryValue
    orderCountFrom?: QueryValue
    orderCountTo?: QueryValue
    search?: QueryValue
}

interface CustomerUpdateBody {
    name?: string
    email?: string
    phone?: string
}

const UPDATABLE_FIELDS = ['name', 'email', 'phone'] as const

interface DateRange {
    $gte?: Date
    $lte?: Date
}

interface NumberRange {
    $gte?: number
    $lte?: number
}

const endOfDay = (value: string | number) => {
    const date = new Date(value)
    date.setHours(23, 59, 59, 999)
    return date
}

// Доступ только для администратора (гард на роутере)
// GET /customers?page=2&limit=5&sortField=totalAmount&sortOrder=desc&...
export const getCustomers = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const query = req.query as CustomersQuery
        const { page, limit, skip } = getPagination(
            query.page,
            query.limit,
            10,
            MAX_LIST_PAGE_SIZE
        )

        const filters: FilterQuery<IUser> = {}

        const createdAt: DateRange = {}
        if (isPresent(query.registrationDateFrom)) {
            createdAt.$gte = new Date(query.registrationDateFrom)
        }
        if (isPresent(query.registrationDateTo)) {
            createdAt.$lte = endOfDay(query.registrationDateTo)
        }
        if (Object.keys(createdAt).length) {
            filters.createdAt = createdAt
        }

        const lastOrderDate: DateRange = {}
        if (isPresent(query.lastOrderDateFrom)) {
            lastOrderDate.$gte = new Date(query.lastOrderDateFrom)
        }
        if (isPresent(query.lastOrderDateTo)) {
            lastOrderDate.$lte = endOfDay(query.lastOrderDateTo)
        }
        if (Object.keys(lastOrderDate).length) {
            filters.lastOrderDate = lastOrderDate
        }

        const totalAmount: NumberRange = {}
        if (isPresent(query.totalAmountFrom)) {
            totalAmount.$gte = Number(query.totalAmountFrom)
        }
        if (isPresent(query.totalAmountTo)) {
            totalAmount.$lte = Number(query.totalAmountTo)
        }
        if (Object.keys(totalAmount).length) {
            filters.totalAmount = totalAmount
        }

        const orderCount: NumberRange = {}
        if (isPresent(query.orderCountFrom)) {
            orderCount.$gte = Number(query.orderCountFrom)
        }
        if (isPresent(query.orderCountTo)) {
            orderCount.$lte = Number(query.orderCountTo)
        }
        if (Object.keys(orderCount).length) {
            filters.orderCount = orderCount
        }

        if (isPresent(query.search)) {
            // Спецсимволы экранируются: пользователь не может задать свою регулярку
            const searchRegex = new RegExp(escapeRegExp(String(query.search)), 'i')
            const orders = await Order.find(
                {
                    $or: [{ deliveryAddress: searchRegex }],
                },
                '_id'
            )

            const orderIds = orders.map((order) => order._id)

            filters.$or = [
                { name: searchRegex },
                { lastOrder: { $in: orderIds } },
            ]
        }

        // Поле сортировки только из белого списка
        const sortField =
            CUSTOMER_SORT_FIELDS.find((field) => field === query.sortField) ??
            'createdAt'
        const sort: Record<string, SortOrder> = {
            [sortField]: query.sortOrder === 'asc' ? 1 : -1,
        }

        const options = { sort, skip, limit }

        const users = await User.find(filters, null, options).populate([
            'orders',
            {
                path: 'lastOrder',
                populate: {
                    path: 'products',
                },
            },
            {
                path: 'lastOrder',
                populate: {
                    path: 'customer',
                },
            },
        ])

        const totalUsers = await User.countDocuments(filters)
        const totalPages = Math.ceil(totalUsers / limit)

        res.status(200).json({
            customers: users,
            pagination: {
                totalUsers,
                totalPages,
                currentPage: page,
                pageSize: limit,
            },
        })
    } catch (error) {
        next(error)
    }
}

// Get /customers/:id
export const getCustomerById = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = await User.findById(req.params.id)
            .populate(['orders', 'lastOrder'])
            .orFail(
                () =>
                    new NotFoundError(
                        'Пользователь по заданному id отсутствует в базе'
                    )
            )
        res.status(200).json(user)
    } catch (error) {
        next(error)
    }
}

// Patch /customers/:id
export const updateCustomer = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        // Только разрешённые поля, статистику и роли через этот роут менять нельзя
        const update = pick(req.body as CustomerUpdateBody, UPDATABLE_FIELDS)
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { $set: update },
            { new: true, runValidators: true }
        )
            .orFail(
                () =>
                    new NotFoundError(
                        'Пользователь по заданному id отсутствует в базе'
                    )
            )
            .populate(['orders', 'lastOrder'])
        res.status(200).json(updatedUser)
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        if (isDuplicateKeyError(error)) {
            return next(
                new ConflictError('Пользователь с таким email уже существует')
            )
        }
        return next(error)
    }
}

// Delete /customers/:id
export const deleteCustomer = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const deletedUser = await User.findByIdAndDelete(req.params.id).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        )
        res.status(200).json(deletedUser)
    } catch (error) {
        next(error)
    }
}
