// Prisma отдаёт BigInt; JSON.stringify по умолчанию бросает TypeError.
// Сериализуем BigInt как строку во всём приложении.
;(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString()
}
