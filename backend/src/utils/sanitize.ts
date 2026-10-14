import sanitizeHtml from 'sanitize-html'

// Удаляет любую HTML-разметку и скрипты, оставляя только текст
export const sanitizeText = (value: string): string =>
    sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim()

export default sanitizeText
