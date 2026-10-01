import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('UsersService', () => {
  let service: UsersService;

  const prisma = { user: { findUnique: jest.fn() } };
  const redis = { get: jest.fn(), set: jest.fn() };
  const config = { get: jest.fn().mockReturnValue(30) };

  beforeEach(async () => {
    jest.clearAllMocks();
    config.get.mockReturnValue(30);

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('returns the cached value without touching Postgres on a cache hit', async () => {
    redis.get.mockResolvedValueOnce('123.45');

    const result = await service.getBalance(1);

    expect(result).toEqual({ id: 1, balance: '123.45' });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to Postgres on a cache miss and repopulates the cache', async () => {
    redis.get.mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 1,
      balance: new Prisma.Decimal('900.00'),
    });

    const result = await service.getBalance(1);

    expect(result).toEqual({ id: 1, balance: '900.00' });
    expect(redis.set).toHaveBeenCalledWith('balance:1', '900.00', 30);
  });

  it('throws NotFoundException when the user does not exist', async () => {
    redis.get.mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(service.getBalance(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(redis.set).not.toHaveBeenCalled();
  });
});
