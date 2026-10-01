import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { balanceCacheKey } from '../common/balance-cache-key';
import { BalanceResponseDto } from './dto/balance-response.dto';

@Injectable()
export class UsersService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.ttlSeconds = this.config.get<number>('REDIS_BALANCE_TTL_SECONDS')!;
  }

  async getBalance(userId: number): Promise<BalanceResponseDto> {
    const cached = await this.redis.get(balanceCacheKey(userId));
    if (cached !== null) {
      return { id: userId, balance: cached };
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`Пользователь ${userId} не найден`);
    }

    const balance = user.balance.toFixed(2);
    await this.redis.set(balanceCacheKey(userId), balance, this.ttlSeconds);

    return { id: user.id, balance };
  }
}
