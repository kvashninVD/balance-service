import { PrismaClient, Prisma, TransactionAction } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, balance: 0 },
  });

  const historyCount = await prisma.transactionHistory.count({ where: { userId: user.id } });

  if (historyCount === 0) {
    await prisma.transactionHistory.create({
      data: {
        userId: user.id,
        action: TransactionAction.TOPUP,
        amount: new Prisma.Decimal('1000.00'),
        ts: new Date(),
      },
    });
    console.log(`Создан начальный TOPUP на 1000.00 для пользователя ${user.id}`);
  } else {
    console.log(`У пользователя ${user.id} уже есть ${historyCount} записей истории, пропускаем сидирование`);
  }

  const { _sum } = await prisma.transactionHistory.aggregate({
    where: { userId: user.id },
    _sum: { amount: true },
  });
  const balance = _sum.amount ?? new Prisma.Decimal(0);

  await prisma.user.update({ where: { id: user.id }, data: { balance } });

  console.log(`Баланс пользователя ${user.id} теперь ${balance.toFixed(2)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
