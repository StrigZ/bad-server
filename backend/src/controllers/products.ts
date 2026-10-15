import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import { Error as MongooseError } from 'mongoose'
import { join } from 'path'
import { PUBLIC_DIR, UPLOAD_PATH, UPLOAD_PATH_TEMP } from '../config'
import BadRequestError from '../errors/bad-request-error'
import ConflictError from '../errors/conflict-error'
import NotFoundError from '../errors/not-found-error'
import Product, { IFile } from '../models/product'
import { isDuplicateKeyError } from '../utils/mongo-errors'
import movingFile from '../utils/movingFile'
import pick from '../utils/pick'
import { QueryValue, getPagination } from '../utils/query'
import TtlCache from '../utils/ttl-cache'

interface ProductBody {
    title?: string
    description?: string
    category?: string
    price?: number | null
    image?: IFile
}

const TEXT_FIELDS = ['title', 'description', 'category'] as const

const tempDir = join(PUBLIC_DIR, UPLOAD_PATH_TEMP)
const permanentDir = join(PUBLIC_DIR, UPLOAD_PATH)

// Список товаров запрашивают чаще всего, поэтому он кэшируется на короткое время.
// Кэш сбрасывается при любом изменении товаров.
const productsCache = new TtlCache<object>(30 * 1000)

// GET /product
const getProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = req.query as { page?: QueryValue; limit?: QueryValue }
        const { page, limit, skip } = getPagination(query.page, query.limit, 5)

        const cacheKey = `${page}:${limit}`
        const cached = productsCache.get(cacheKey)
        if (cached) {
            return res.send(cached)
        }

        const products = await Product.find({}, null, { skip, limit })
        const totalProducts = await Product.countDocuments({})
        const totalPages = Math.ceil(totalProducts / limit)
        const response = {
            items: products,
            pagination: {
                totalProducts,
                totalPages,
                currentPage: page,
                pageSize: limit,
            },
        }
        productsCache.set(cacheKey, response)
        return res.send(response)
    } catch (err) {
        return next(err)
    }
}

// POST /product
const createProduct = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { description, category, price, title, image } =
            req.body as ProductBody

        // Переносим картинку из временной папки
        if (image) {
            await movingFile(image.fileName, tempDir, permanentDir)
        }

        const product = await Product.create({
            description,
            image,
            category,
            price,
            title,
        })
        productsCache.clear()
        return res.status(constants.HTTP_STATUS_CREATED).send(product)
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        if (isDuplicateKeyError(error)) {
            return next(
                new ConflictError('Товар с таким заголовком уже существует')
            )
        }
        return next(error)
    }
}

// PATCH /product/:productId
const updateProduct = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { productId } = req.params
        const body = req.body as ProductBody
        const { image } = body

        // Переносим картинку из временной папки
        if (image) {
            await movingFile(image.fileName, tempDir, permanentDir)
        }

        // В обновление попадают только известные поля
        const product = await Product.findByIdAndUpdate(
            productId,
            {
                $set: {
                    ...pick(body, TEXT_FIELDS),
                    price: body.price ? body.price : null,
                    ...(image ? { image } : {}),
                },
            },
            { runValidators: true, new: true }
        ).orFail(() => new NotFoundError('Нет товара по заданному id'))
        productsCache.clear()
        return res.send(product)
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID товара'))
        }
        if (isDuplicateKeyError(error)) {
            return next(
                new ConflictError('Товар с таким заголовком уже существует')
            )
        }
        return next(error)
    }
}

// DELETE /product/:productId
const deleteProduct = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { productId } = req.params
        const product = await Product.findByIdAndDelete(productId).orFail(
            () => new NotFoundError('Нет товара по заданному id')
        )
        productsCache.clear()
        return res.send(product)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID товара'))
        }
        return next(error)
    }
}

export { createProduct, deleteProduct, getProducts, updateProduct }
