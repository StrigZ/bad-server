import { Joi, Segments, celebrate } from 'celebrate'
import { PaymentType, StatusType, phoneRegExp } from '../constants/order'
import {
    CUSTOMER_SORT_FIELDS,
    MAX_SEARCH_LENGTH,
    ORDER_SORT_FIELDS,
} from '../constants/query'
import { sanitizeText } from '../utils/sanitize'

export { PaymentType, phoneRegExp }

// Текстовое поле: HTML-разметка вырезается (защита от XSS), затем проверяется длина
const safeText = (min: number, max: number) =>
    Joi.string()
        .custom((value: string) => sanitizeText(value))
        .min(min)
        .max(max)

// ObjectId: ровно 24 hex-символа (Types.ObjectId.isValid пропускает и любые 12-символьные строки)
const objectId = Joi.string()
    .hex()
    .length(24)
    .messages({
        'string.hex': 'Невалидный id',
        'string.length': 'Невалидный id',
    })

// Путь к загруженному файлу: сегменты из букв, цифр, "_" и "-", в имени файла допустимы точки,
// но имя не может состоять только из точек (нельзя передать "..")
const imagePathRegExp = /^(?:\/[\w-]+)*\/(?!\.+$)[\w.-]+$/

const imageSchema = Joi.object().keys({
    fileName: Joi.string().max(200).pattern(imagePathRegExp).required(),
    originalName: safeText(1, 255).required(),
})

const email = Joi.string().max(254).email()
// email для регистрации и входа: .message() относится к последнему правилу (.email())
const requiredEmail = Joi.string()
    .max(254)
    .required()
    .email()
    .message('Поле "email" должно быть валидным email-адресом')
    .messages({
        'string.empty': 'Поле "email" должно быть заполнено',
    })
const phone = Joi.string().max(25).pattern(phoneRegExp)

// page и limit: должны быть положительными целыми; слишком большие значения не отклоняются,
// а ограничиваются в контроллере (getPagination)
const page = Joi.number().integer().min(1).unsafe().default(1)
const limit = (defaultValue: number) =>
    Joi.number().integer().min(1).unsafe().default(defaultValue)
const sortOrder = Joi.string().valid('asc', 'desc').default('desc')
const search = Joi.string().max(MAX_SEARCH_LENGTH).allow('')
const dateFilter = Joi.string().isoDate().allow('')
const amountFilter = Joi.number().min(0).allow('')
const countFilter = Joi.number().integer().min(0).allow('')

// Query-параметры: неизвестные ключи (в том числе status[$ne]=...) отклоняются,
// значения проверяются по типу и допустимому набору
const querySchema = (keys: Parameters<typeof Joi.object>[0]) =>
    celebrate({
        [Segments.QUERY]: Joi.object(keys),
    })

export const validateOrderBody = celebrate({
    body: Joi.object().keys({
        items: Joi.array()
            .items(objectId)
            .min(1)
            .max(100)
            .required()
            .messages({
                'array.min': 'Не указаны товары',
                'any.required': 'Не указаны товары',
            }),
        payment: Joi.string()
            .valid(...Object.values(PaymentType))
            .required()
            .messages({
                'any.only':
                    'Указано не валидное значение для способа оплаты, возможные значения - "card", "online"',
                'string.empty': 'Не указан способ оплаты',
            }),
        email: email.required().messages({
            'string.empty': 'Не указан email',
        }),
        phone: phone.required().messages({
            'string.empty': 'Не указан телефон',
        }),
        address: safeText(1, 200).required().messages({
            'string.empty': 'Не указан адрес',
        }),
        total: Joi.number().min(0).required().messages({
            'number.base': 'Не указана сумма заказа',
        }),
        comment: Joi.string()
            .custom((value: string) => sanitizeText(value))
            .max(500)
            .optional()
            .allow(''),
    }),
})

// Изменение статуса заказа
export const validateOrderUpdateBody = celebrate({
    body: Joi.object()
        .keys({
            status: Joi.string()
                .valid(...Object.values(StatusType))
                .required(),
        })
        .options({ stripUnknown: true }),
})

// валидация товара.
export const validateProductBody = celebrate({
    body: Joi.object().keys({
        title: safeText(2, 30).required().messages({
            'string.min': 'Минимальная длина поля "name" - 2',
            'string.max': 'Максимальная длина поля "name" - 30',
            'string.empty': 'Поле "title" должно быть заполнено',
        }),
        image: imageSchema,
        category: safeText(1, 50).required().messages({
            'string.empty': 'Поле "category" должно быть заполнено',
        }),
        description: safeText(1, 1000).required().messages({
            'string.empty': 'Поле "description" должно быть заполнено',
        }),
        price: Joi.number().min(0).allow(null),
    }),
})

export const validateProductUpdateBody = celebrate({
    body: Joi.object()
        .keys({
            title: safeText(2, 30).messages({
                'string.min': 'Минимальная длина поля "name" - 2',
                'string.max': 'Максимальная длина поля "name" - 30',
            }),
            image: imageSchema,
            category: safeText(1, 50),
            description: safeText(1, 1000),
            price: Joi.number().min(0).allow(null),
        })
        .min(1),
})

// :productId в роутах товаров
export const validateObjId = celebrate({
    params: Joi.object().keys({
        productId: objectId.required(),
    }),
})

// :id в роутах клиентов и заказов
export const validateIdParam = celebrate({
    params: Joi.object().keys({
        id: objectId.required(),
    }),
})

// :orderNumber - только цифры
export const validateOrderNumberParam = celebrate({
    params: Joi.object().keys({
        orderNumber: Joi.string()
            .pattern(/^\d{1,12}$/)
            .required()
            .messages({ 'string.pattern.base': 'Невалидный номер заказа' }),
    }),
})

// Регистрация
export const validateUserBody = celebrate({
    body: Joi.object().keys({
        name: safeText(2, 30).messages({
            'string.min': 'Минимальная длина поля "name" - 2',
            'string.max': 'Максимальная длина поля "name" - 30',
        }),
        password: Joi.string().min(6).max(72).required().messages({
            'string.empty': 'Поле "password" должно быть заполнено',
        }),
        email: requiredEmail,
    }),
})

// Вход
export const validateAuthentication = celebrate({
    body: Joi.object().keys({
        email: requiredEmail,
        password: Joi.string().max(72).required().messages({
            'string.empty': 'Поле "password" должно быть заполнено',
        }),
    }),
})

// Обновление профиля (свой профиль и профиль клиента из админки):
// принимаются только эти поля, всё остальное (roles, tokens, password, операторы Mongo)
// отбрасывается, а пустой результат отклоняется
export const validateUserUpdateBody = celebrate({
    body: Joi.object()
        .keys({
            name: safeText(2, 30).messages({
                'string.min': 'Минимальная длина поля "name" - 2',
                'string.max': 'Максимальная длина поля "name" - 30',
            }),
            email,
            phone,
        })
        .min(1)
        .options({ stripUnknown: true }),
})

export const validateOrdersQuery = querySchema({
    page,
    limit: limit(10),
    sortField: Joi.string()
        .valid(...ORDER_SORT_FIELDS)
        .default('createdAt'),
    sortOrder,
    status: Joi.string()
        .valid(...Object.values(StatusType))
        .allow(''),
    totalAmountFrom: amountFilter,
    totalAmountTo: amountFilter,
    orderDateFrom: dateFilter,
    orderDateTo: dateFilter,
    search,
})

export const validateCustomersQuery = querySchema({
    page,
    limit: limit(10),
    sortField: Joi.string()
        .valid(...CUSTOMER_SORT_FIELDS)
        .default('createdAt'),
    sortOrder,
    registrationDateFrom: dateFilter,
    registrationDateTo: dateFilter,
    lastOrderDateFrom: dateFilter,
    lastOrderDateTo: dateFilter,
    totalAmountFrom: amountFilter,
    totalAmountTo: amountFilter,
    orderCountFrom: countFilter,
    orderCountTo: countFilter,
    search,
})

export const validateMyOrdersQuery = querySchema({
    page,
    limit: limit(5),
    search,
})

export const validateProductsQuery = querySchema({
    page,
    limit: limit(5),
})
