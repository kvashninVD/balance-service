import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransactionAction } from '@prisma/client';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('TransactionsService', () => {
  let service: TransactionsService;

  const tx = {
    $queryRaw: jest.fn(),
    transactionHistory: {
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
  };

  const prisma = {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  };

  const redis = {
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = moduleRef.get(TransactionsService);
  });

  it('debits the balance, appends a signed ledger row, and invalidates the cache', async () => {
    tx.$queryRaw.mockResolvedValueOnce([
      { id: 1, balance: new Prisma.Decimal('900.00') },
    ]);
    tx.transactionHistory.create.mockResolvedValueOnce({
      id: 10,
      action: TransactionAction.PURCHASE,
      amount: new Prisma.Decimal('-100.00'),
      ts: new Date('2026-01-01T00:00:00.000Z'),
    });
    tx.transactionHistory.aggregate.mockResolvedValueOnce({
      _sum: { amount: new Prisma.Decimal('800.00') },
    });

    const result = await service.charge(1, {
      action: TransactionAction.PURCHASE,
      amount: '100.00',
    });

    expect(tx.transactionHistory.create).toHaveBeenCalledWith({
      data: {
        userId: 1,
        action: TransactionAction.PURCHASE,
        amount: expect.any(Prisma.Decimal),
        ts: expect.any(Date),
      },
    });
    expect(
      tx.transactionHistory.create.mock.calls[0][0].data.amount.toString(),
    ).toBe('-100');
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { balance: expect.any(Prisma.Decimal) },
    });
    expect(redis.del).toHaveBeenCalledWith('balance:1');
    expect(result).toEqual({
      id: 1,
      balance: '800.00',
      transaction: {
        id: 10,
        action: TransactionAction.PURCHASE,
        amount: '-100.00',
        ts: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
  });

  it('credits the balance for a TOPUP', async () => {
    tx.$queryRaw.mockResolvedValueOnce([
      { id: 1, balance: new Prisma.Decimal('100.00') },
    ]);
    tx.transactionHistory.create.mockResolvedValueOnce({
      id: 11,
      action: TransactionAction.TOPUP,
      amount: new Prisma.Decimal('50.00'),
      ts: new Date(),
    });
    tx.transactionHistory.aggregate.mockResolvedValueOnce({
      _sum: { amount: new Prisma.Decimal('150.00') },
    });

    await service.charge(1, {
      action: TransactionAction.TOPUP,
      amount: '50.00',
    });

    expect(
      tx.transactionHistory.create.mock.calls[0][0].data.amount.toString(),
    ).toBe('50');
  });

  it('rejects a PURCHASE that would take the balance negative, without writing to the ledger', async () => {
    tx.$queryRaw.mockResolvedValueOnce([
      { id: 1, balance: new Prisma.Decimal('50.00') },
    ]);

    await expect(
      service.charge(1, {
        action: TransactionAction.PURCHASE,
        amount: '100.00',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.transactionHistory.create).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the user row does not exist (lock query returns nothing)', async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.charge(999, {
        action: TransactionAction.PURCHASE,
        amount: '10.00',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.transactionHistory.create).not.toHaveBeenCalled();
  });

  it('rejects a non-positive amount before ever opening a transaction', async () => {
    await expect(
      service.charge(1, { action: TransactionAction.PURCHASE, amount: '0.00' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
