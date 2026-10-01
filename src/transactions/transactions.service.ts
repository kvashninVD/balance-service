import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { balanceCacheKey } from '../common/balance-cache-key';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { TRANSACTION_DIRECTION } from './transaction-direction';

interface LockedUserRow {
  id: number;
  balance: Prisma.Decimal;
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async charge(
    userId: number,
    dto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    const requestedAmount = new Prisma.Decimal(dto.amount);
    if (requestedAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Сумма должна быть больше нуля');
    }

    const signedAmount = requestedAmount.mul(TRANSACTION_DIRECTION[dto.action]);

    const { updatedBalance, entry } = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<LockedUserRow[]>`
        SELECT id, balance FROM "users" WHERE id = ${userId} FOR UPDATE
      `;
        const user = locked[0];
        if (!user) {
          throw new NotFoundException(`Пользователь ${userId} не найден`);
        }

        const currentBalance = new Prisma.Decimal(user.balance);
        if (currentBalance.add(signedAmount).isNegative()) {
          throw new ConflictException('Недостаточно средств');
        }

        const entry = await tx.transactionHistory.create({
          data: {
            userId,
            action: dto.action,
            amount: signedAmount,
            ts: new Date(),
          },
        });

        const { _sum } = await tx.transactionHistory.aggregate({
          where: { userId },
          _sum: { amount: true },
        });
        const recalculatedBalance = _sum.amount ?? new Prisma.Decimal(0);

        await tx.user.update({
          where: { id: userId },
          data: { balance: recalculatedBalance },
        });

        return { updatedBalance: recalculatedBalance, entry };
      },
    );

    await this.redis.del(balanceCacheKey(userId));

    return {
      id: userId,
      balance: updatedBalance.toFixed(2),
      transaction: {
        id: entry.id,
        action: entry.action,
        amount: entry.amount.toFixed(2),
        ts: entry.ts,
      },
    };
  }
}
