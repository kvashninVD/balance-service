import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => {
        try {
          await this.prisma.$queryRaw`SELECT 1`;
          return { postgres: { status: 'up' } };
        } catch (error) {
          return {
            postgres: { status: 'down', message: (error as Error).message },
          };
        }
      },
      async (): Promise<HealthIndicatorResult> => {
        try {
          await this.redis.get('healthcheck');
          return { redis: { status: 'up' } };
        } catch (error) {
          return {
            redis: { status: 'down', message: (error as Error).message },
          };
        }
      },
    ]);
  }
}
