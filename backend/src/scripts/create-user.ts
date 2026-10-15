/* eslint-disable no-console */
import mongoose from 'mongoose'
import { DB_ADDRESS } from '../config'
import User, { Role } from '../models/user'

// Создаёт пользователя (или обновляет пароль и роли существующего).
// Пароль хэшируется bcrypt при сохранении.
// Использование: npm run create-user -- <email> <password> [admin]
const [email, password, role] = process.argv.slice(2)

const run = async () => {
    if (!email || !password) {
        console.error('Использование: npm run create-user -- <email> <password> [admin]')
        process.exit(1)
    }

    await mongoose.connect(DB_ADDRESS)

    const roles = role === 'admin' ? [Role.Customer, Role.Admin] : [Role.Customer]
    const existing = await User.findOne({ email })
    if (existing) {
        existing.password = password
        existing.roles = roles
        await existing.save()
        console.log(`Пользователь ${email} обновлён`)
    } else {
        await User.create({ email, password, roles })
        console.log(`Пользователь ${email} создан`)
    }

    await mongoose.disconnect()
}

run().catch((error) => {
    console.error(error)
    process.exit(1)
})
