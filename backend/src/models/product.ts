import { unlink } from 'fs/promises'
import mongoose, { Document } from 'mongoose'
import { PUBLIC_DIR } from '../config'
import safeJoin from '../utils/safe-path'

export interface IFile {
    fileName: string
    originalName: string
}

export interface IProduct extends Document {
    title: string
    image: IFile
    category: string
    description: string
    price: number
}

const cardsSchema = new mongoose.Schema<IProduct>(
    {
        title: {
            type: String,
            unique: true,
            required: [true, 'Поле "title" должно быть заполнено'],
            minlength: [2, 'Минимальная длина поля "title" - 2'],
            maxlength: [30, 'Максимальная длина поля "title" - 30'],
        },
        image: {
            fileName: {
                type: String,
                required: [true, 'Поле "image.fileName" должно быть заполнено'],
                maxlength: [200, 'Максимальная длина поля "image.fileName" - 200'],
            },
            originalName: { type: String, maxlength: 255 },
        },
        category: {
            type: String,
            required: [true, 'Поле "category" должно быть заполнено'],
            maxlength: [50, 'Максимальная длина поля "category" - 50'],
        },
        description: {
            type: String,
            maxlength: [1000, 'Максимальная длина поля "description" - 1000'],
        },
        price: {
            type: Number,
            default: null,
        },
    },
    { versionKey: false }
)

cardsSchema.index({ title: 'text' })

// Удаляет файл изображения. Путь строится безопасно: он не может выйти за пределы public.
async function removeImage(fileName: string) {
    const fullPath = safeJoin(PUBLIC_DIR, fileName)
    if (!fullPath) {
        return
    }
    try {
        await unlink(fullPath)
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.error(error)
        }
    }
}

// Удаляем старое изображение перед обновлением сущности
cardsSchema.pre('findOneAndUpdate', async function deleteOldImage() {
    const update = this.getUpdate() as unknown as {
        $set?: { image?: IFile }
    } | null
    const newImage = update?.$set?.image
    if (!newImage) {
        return
    }
    const docToUpdate = await this.model.findOne(this.getQuery())
    if (!docToUpdate || docToUpdate.image?.fileName === newImage.fileName) {
        return
    }
    await removeImage(docToUpdate.image.fileName)
})

// Удаляем файл с изображением после удаления сущности
cardsSchema.post('findOneAndDelete', async (doc: IProduct | null) => {
    if (doc?.image?.fileName) {
        await removeImage(doc.image.fileName)
    }
})

export default mongoose.model<IProduct>('product', cardsSchema)
