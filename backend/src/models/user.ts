/* eslint-disable no-param-reassign */
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import jwt, { SignOptions } from 'jsonwebtoken'
import mongoose, { Document, HydratedDocument, Model, Types } from 'mongoose'
import validator from 'validator'

import { ACCESS_TOKEN, REFRESH_TOKEN } from '../config'
import UnauthorizedError from '../errors/unauthorized-error'

export enum Role {
    Customer = 'customer',
    Admin = 'admin',
}

export interface IUser extends Document {
    name: string
    email: string
    password: string
    tokens: { token: string }[]
    roles: Role[]
    phone: string
    totalAmount: number
    orderCount: number
    orders: Types.ObjectId[]
    lastOrderDate: Date | null
    lastOrder: Types.ObjectId | null
}

interface IUserMethods {
    generateAccessToken(): string
    generateRefreshToken(): Promise<string>
    toJSON(): string
    calculateOrderStats(): Promise<void>
}

interface IUserModel extends Model<IUser, {}, IUserMethods> {
    findUserByCredentials: (
        email: string,
        password: string
    ) => Promise<HydratedDocument<IUser, IUserMethods>>
}

const BCRYPT_ROUNDS = 10
// Хэш-заглушка: сравнение выполняется даже для несуществующего email,
// чтобы время ответа не показывало, зарегистрирован ли такой пользователь
const DUMMY_HASH = bcrypt.hashSync('dummy-password', BCRYPT_ROUNDS)

const userSchema = new mongoose.Schema<IUser, IUserModel, IUserMethods>(
    {
        name: {
            type: String,
            default: 'Евлампий',
            minlength: [2, 'Минимальная длина поля "name" - 2'],
            maxlength: [30, 'Максимальная длина поля "name" - 30'],
        },
        // в схеме пользователя есть обязательные email и password
        email: {
            type: String,
            required: [true, 'Поле "email" должно быть заполнено'],
            unique: true, // поле email уникально (есть опция unique: true);
            maxlength: [254, 'Максимальная длина поля "email" - 254'],
            validate: {
                // для проверки email студенты используют validator
                validator: (v: string) => validator.isEmail(v),
                message: 'Поле "email" должно быть валидным email-адресом',
            },
        },
        // пароль хранится в виде bcrypt-хэша; ограничение 72 - предел алгоритма bcrypt
        password: {
            type: String,
            required: [true, 'Поле "password" должно быть заполнено'],
            minlength: [6, 'Минимальная длина поля "password" - 6'],
            maxlength: [72, 'Максимальная длина поля "password" - 72'],
            select: false,
        },

        tokens: [
            {
                token: { required: true, type: String },
            },
        ],
        roles: {
            type: [String],
            enum: Object.values(Role),
            default: [Role.Customer],
        },
        phone: {
            type: String,
            maxlength: [25, 'Максимальная длина поля "phone" - 25'],
        },
        lastOrderDate: {
            type: Date,
            default: null,
        },
        lastOrder: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'order',
            default: null,
        },
        totalAmount: { type: Number, default: 0 },
        orderCount: { type: Number, default: 0 },
        orders: [
            {
                type: Types.ObjectId,
                ref: 'order',
            },
        ],
    },
    {
        versionKey: false,
        timestamps: true,
        // select: false не работает при создании сущности, поэтому секретные поля
        // дополнительно вырезаются в toJSON
        toJSON: {
            virtuals: true,
            transform: (_doc, ret) => {
                const { tokens: _tokens, password: _password, _id, roles: _roles, ...rest } = ret
                return rest
            },
        },
    }
)

// Хэширование пароля при создании пользователя или смене пароля
userSchema.pre('save', async function hashingPassword() {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS)
    }
})

userSchema.methods.generateAccessToken = function generateAccessToken() {
    const user = this
    return jwt.sign(
        {
            _id: user._id.toString(),
            email: user.email,
        },
        ACCESS_TOKEN.secret,
        {
            expiresIn: ACCESS_TOKEN.expiry as SignOptions['expiresIn'],
            subject: user.id.toString(),
        }
    )
}

userSchema.methods.generateRefreshToken =
    async function generateRefreshToken() {
        const user = this
        const refreshToken = jwt.sign(
            {
                _id: user._id.toString(),
            },
            REFRESH_TOKEN.secret,
            {
                expiresIn: REFRESH_TOKEN.expiry as SignOptions['expiresIn'],
                subject: user.id.toString(),
            }
        )

        // В базе хранится только хэш refresh токена
        const rTknHash = crypto
            .createHmac('sha256', REFRESH_TOKEN.secret)
            .update(refreshToken)
            .digest('hex')

        user.tokens.push({ token: rTknHash })
        await user.save()

        return refreshToken
    }

userSchema.statics.findUserByCredentials = async function findByCredentials(
    email: string,
    password: string
) {
    // Типы TypeScript в рантайме не проверяются: клиент может прислать объект вместо строки
    // ({ "$ne": null }), который превратился бы в оператор MongoDB
    if (typeof email !== 'string' || typeof password !== 'string') {
        throw new UnauthorizedError('Неправильные почта или пароль')
    }
    const user = await this.findOne({ email }).select('+password')
    const passwordMatch = await bcrypt.compare(
        password,
        user?.password ?? DUMMY_HASH
    )
    if (!user || !passwordMatch) {
        throw new UnauthorizedError('Неправильные почта или пароль')
    }
    return user
}

userSchema.methods.calculateOrderStats = async function calculateOrderStats() {
    const user = this
    const orderStats = await mongoose.model('order').aggregate([
        { $match: { customer: user._id } },
        {
            $group: {
                _id: null,
                totalAmount: { $sum: '$totalAmount' },
                lastOrderDate: { $max: '$createdAt' },
                orderCount: { $sum: 1 },
                lastOrder: { $last: '$_id' },
            },
        },
    ])

    if (orderStats.length > 0) {
        const stats = orderStats[0]
        user.totalAmount = stats.totalAmount
        user.orderCount = stats.orderCount
        user.lastOrderDate = stats.lastOrderDate
        user.lastOrder = stats.lastOrder
    } else {
        user.totalAmount = 0
        user.orderCount = 0
        user.lastOrderDate = null
        user.lastOrder = null
    }

    await user.save()
}
const UserModel = mongoose.model<IUser, IUserModel>('user', userSchema)

export default UserModel
