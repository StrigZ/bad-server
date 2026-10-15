import { NextFunction, Request, Response } from 'express'
import { FilterQuery, Error as MongooseError, PipelineStage } from 'mongoose'
import { StatusType } from '../constants/order'
import { MAX_LIST_PAGE_SIZE, ORDER_SORT_FIELDS } from '../constants/query'
import BadRequestError from '../errors/bad-request-error'
import NotFoundError from '../errors/not-found-error'
import Order, { IOrder } from '../models/order'
import Product, { IProduct } from '../models/product'
import User from '../models/user'
import escapeRegExp from '../utils/escapeRegExp'
import { QueryValue, getPagination, isPresent } from '../utils/query'

interface OrdersQuery {
    page?: QueryValue
    limit?: QueryValue
    sortField?: QueryValue
    sortOrder?: QueryValue
    status?: QueryValue
    totalAmountFrom?: QueryValue
    totalAmountTo?: QueryValue
    orderDateFrom?: QueryValue
    orderDateTo?: QueryValue
    search?: QueryValue
}

interface MyOrdersQuery {
    page?: QueryValue
    limit?: QueryValue
    search?: QueryValue
}

interface CreateOrderBody {
    address: string
    payment: string
    phone: string
    total: number
    email: string
    items: string[]
    comment?: string
}

// Доступ только для администратора (гард на роуте)
// GET /orders/all?page=2&limit=5&sortField=totalAmount&sortOrder=desc&orderDateFrom=2024-07-01&status=delivering&search=...
export const getOrders = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const query = req.query as OrdersQuery
        const { page, limit, skip } = getPagination(
            query.page,
            query.limit,
            10,
            MAX_LIST_PAGE_SIZE
        )

        const filters: FilterQuery<IOrder> = {}

        // Статус - только строка из списка допустимых значений.
        // Пользовательский объект в фильтр не попадает ни в каком виде.
        if (
            isPresent(query.status) &&
            Object.values(StatusType).includes(query.status as StatusType)
        ) {
            filters.status = query.status
        }

        const totalAmount: { $gte?: number; $lte?: number } = {}
        if (isPresent(query.totalAmountFrom)) {
            totalAmount.$gte = Number(query.totalAmountFrom)
        }
        if (isPresent(query.totalAmountTo)) {
            totalAmount.$lte = Number(query.totalAmountTo)
        }
        if (Object.keys(totalAmount).length) {
            filters.totalAmount = totalAmount
        }

        const createdAt: { $gte?: Date; $lte?: Date } = {}
        if (isPresent(query.orderDateFrom)) {
            createdAt.$gte = new Date(query.orderDateFrom)
        }
        if (isPresent(query.orderDateTo)) {
            createdAt.$lte = new Date(query.orderDateTo)
        }
        if (Object.keys(createdAt).length) {
            filters.createdAt = createdAt
        }

        const basePipeline: PipelineStage[] = [
            { $match: filters },
            {
                $lookup: {
                    from: 'products',
                    localField: 'products',
                    foreignField: '_id',
                    as: 'products',
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'customer',
                    foreignField: '_id',
                    as: 'customer',
                },
            },
            { $unwind: '$customer' },
        ]

        if (isPresent(query.search)) {
            // Спецсимволы экранируются: пользователь не может задать свою регулярку
            const searchRegex = new RegExp(escapeRegExp(String(query.search)), 'i')
            const searchNumber = Number(query.search)

            const searchConditions: Record<string, unknown>[] = [
                { 'products.title': searchRegex },
            ]

            if (!Number.isNaN(searchNumber)) {
                searchConditions.push({ orderNumber: searchNumber })
            }

            basePipeline.push({ $match: { $or: searchConditions } })
        }

        // Поле сортировки только из белого списка; _id делает порядок стабильным
        const sortField =
            ORDER_SORT_FIELDS.find((field) => field === query.sortField) ??
            'createdAt'
        const direction = query.sortOrder === 'asc' ? 1 : -1

        const orders = await Order.aggregate([
            ...basePipeline,
            { $sort: { [sortField]: direction, _id: direction } },
            { $skip: skip },
            { $limit: limit },
            {
                // Клиент отдаётся только выбранными полями: хэш пароля, токены и роли не утекают
                $project: {
                    orderNumber: 1,
                    status: 1,
                    totalAmount: 1,
                    products: 1,
                    createdAt: 1,
                    customer: {
                        _id: '$customer._id',
                        name: '$customer.name',
                        email: '$customer.email',
                        phone: '$customer.phone',
                    },
                },
            },
        ])

        const [counter] = await Order.aggregate<{ total: number }>([
            ...basePipeline,
            { $count: 'total' },
        ])
        const totalOrders = counter?.total ?? 0
        const totalPages = Math.ceil(totalOrders / limit)

        res.status(200).json({
            orders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage: page,
                pageSize: limit,
            },
        })
    } catch (error) {
        next(error)
    }
}

export const getOrdersCurrentUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = res.locals.user._id
        const query = req.query as MyOrdersQuery
        const { page, limit, skip } = getPagination(query.page, query.limit, 5)

        const user = await User.findById(userId)
            .populate({
                path: 'orders',
                populate: [
                    {
                        path: 'products',
                    },
                    {
                        path: 'customer',
                    },
                ],
            })
            .orFail(
                () =>
                    new NotFoundError(
                        'Пользователь по заданному id отсутствует в базе'
                    )
            )

        let orders = user.orders as unknown as IOrder[]

        if (isPresent(query.search)) {
            const searchRegex = new RegExp(escapeRegExp(String(query.search)), 'i')
            const searchNumber = Number(query.search)
            const products = await Product.find({ title: searchRegex })
            const productIds = products.map((product) => product._id)

            orders = orders.filter((order) => {
                const matchesProductTitle = order.products.some((product) =>
                    productIds.some((id) => id.equals(product._id))
                )
                const matchesOrderNumber =
                    !Number.isNaN(searchNumber) &&
                    order.orderNumber === searchNumber

                return matchesOrderNumber || matchesProductTitle
            })
        }

        const totalOrders = orders.length
        const totalPages = Math.ceil(totalOrders / limit)

        orders = orders.slice(skip, skip + limit)

        return res.send({
            orders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage: page,
                pageSize: limit,
            },
        })
    } catch (error) {
        return next(error)
    }
}

// Get order by number (только администратор)
export const getOrderByNumber = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const order = await Order.findOne({
            orderNumber: req.params.orderNumber,
        })
            .populate(['customer', 'products'])
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
        return res.status(200).json(order)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}

export const getOrderCurrentUserByNumber = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id
    try {
        const order = await Order.findOne({
            orderNumber: req.params.orderNumber,
        })
            .populate(['customer', 'products'])
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
        if (!order.customer._id.equals(userId)) {
            // Если нет доступа не возвращаем 403, а отдаем 404
            return next(
                new NotFoundError('Заказ по заданному id отсутствует в базе')
            )
        }
        return res.status(200).json(order)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}

// POST /order
export const createOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = res.locals.user._id
        const { address, payment, phone, total, email, items, comment } =
            req.body as CreateOrderBody

        // Загружаются только товары из заказа, а не весь каталог
        const uniqueIds = [...new Set(items)]
        const products = await Product.find<IProduct>({
            _id: { $in: uniqueIds },
        })
        const productsById = new Map(
            products.map((product) => [product._id.toString(), product])
        )

        let totalBasket = 0
        items.forEach((id) => {
            const product = productsById.get(id)
            if (!product) {
                throw new BadRequestError(`Товар с id ${id} не найден`)
            }
            if (product.price === null) {
                throw new BadRequestError(`Товар с id ${id} не продается`)
            }
            totalBasket += product.price
        })
        if (totalBasket !== total) {
            return next(new BadRequestError('Неверная сумма заказа'))
        }

        const newOrder = new Order({
            totalAmount: total,
            products: items,
            payment,
            phone,
            email,
            comment,
            customer: userId,
            deliveryAddress: address,
        })
        const populateOrder = await newOrder.populate(['customer', 'products'])
        await populateOrder.save()

        return res.status(200).json(populateOrder)
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        return next(error)
    }
}

// Update an order
export const updateOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { status } = req.body
        const updatedOrder = await Order.findOneAndUpdate(
            { orderNumber: req.params.orderNumber },
            { status },
            { new: true, runValidators: true }
        )
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
            .populate(['customer', 'products'])
        return res.status(200).json(updatedOrder)
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}

// Delete an order
export const deleteOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const deletedOrder = await Order.findByIdAndDelete(req.params.id)
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
            .populate(['customer', 'products'])
        return res.status(200).json(deletedOrder)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}
