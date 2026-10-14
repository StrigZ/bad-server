export enum StatusType {
    Cancelled = 'cancelled',
    Completed = 'completed',
    New = 'new',
    Delivering = 'delivering',
}

export enum PaymentType {
    Card = 'card',
    Online = 'online',
}

// Телефон: необязательный «+», затем цифры, пробелы, скобки и дефисы.
// Один квантификатор на один символьный класс, вложенных повторов нет, поэтому
// время проверки линейно (нет ReDoS).
export const phoneRegExp = /^\+?[\d\s()-]{5,25}$/
