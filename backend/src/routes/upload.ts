import { Router } from 'express'
import { uploadFile } from '../controllers/upload'
import fileMiddleware from '../middlewares/file'

// auth и проверка роли администратора подключены в routes/index.ts
const uploadRouter = Router()
uploadRouter.post('/', fileMiddleware.single('file'), uploadFile)

export default uploadRouter
