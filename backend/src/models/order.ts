/* eslint-disable prefer-arrow-callback */
import mongoose, { Document, Schema, Types } from 'mongoose'
import validator from 'validator'
import { PaymentType, StatusType, phoneRegExp } from '../constants/order'
import Counter from './counter'
import User from './user'

export { StatusType }

export interface IOrder extends Document {
    id: Types.ObjectId
    orderNumber: number
    status: string
    totalAmount: number
    products: Types.ObjectId[]
    payment: PaymentType
    customer: Types.ObjectId
    deliveryAddress: string
    phone: string
    comment: string
    email: string
}

const orderSchema: Schema = new Schema(
    {
        orderNumber: { type: Number, unique: true },
        status: {
            type: String,
            enum: Object.values(StatusType),
            default: StatusType.New,
        },
        totalAmount: { type: Number, required: true },
        products: [
            {
                type: Types.ObjectId,
                ref: 'product',
            },
        ],
        payment: {
            type: String,
            enum: Object.values(PaymentType),
            required: true,
        },
        customer: { type: Types.ObjectId, ref: 'user' },
        deliveryAddress: {
            type: String,
            maxlength: [200, 'Максимальная длина поля "address" - 200'],
        },
        email: {
            type: String,
            required: [true, 'Поле "email" должно быть заполнено'],
            maxlength: [254, 'Максимальная длина поля "email" - 254'],
            validate: {
                validator: (v: string) => validator.isEmail(v),
                message: 'Поле "email" должно быть валидным email-адресом',
            },
        },
        phone: {
            type: String,
            required: [true, 'Поле "phone" должно быть заполнено'],
            validate: {
                validator: (v: string) => phoneRegExp.test(v),
                message: 'Поле "phone" должно быть валидным телефоном.',
            },
        },
        comment: {
            type: String,
            default: '',
            maxlength: [500, 'Максимальная длина поля "comment" - 500'],
        },
    },
    { versionKey: false, timestamps: true }
)

orderSchema.pre('save', async function incrementOrderNumber(next) {
    const order = this

    if (order.isNew) {
        const counter = await Counter.findOneAndUpdate(
            {},
            { $inc: { sequenceValue: 1 } },
            { new: true, upsert: true }
        )

        order.orderNumber = counter.sequenceValue
    }

    next()
})

orderSchema.post('save', async function updateUserStats(doc) {
    const user = await User.findById(doc.customer)
    if (user) {
        user.orders.push(doc.id)
        await user.calculateOrderStats()
    }
})

orderSchema.post('findOneAndDelete', async function updateUserStats(order) {
    if (!order) {
        return
    }
    const user = await User.findByIdAndUpdate(order.customer, {
        $pull: { orders: order._id },
    })
    await user?.calculateOrderStats()
})

export default mongoose.model<IOrder>('order', orderSchema)
