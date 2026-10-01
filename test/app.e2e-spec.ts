import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Balance API (e2e)', () => {
  let app: INestApplication;
  const userId = 1;
  let balance: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const cushion = await request(app.getHttpServer())
      .post(`/users/${userId}/transactions`)
      .send({ action: 'TOPUP', amount: '1000000.00' })
      .expect(201);
    balance = cushion.body.balance;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health reports postgres and redis as up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.info.postgres.status).toBe('up');
    expect(res.body.info.redis.status).toBe('up');
  });

  it('GET /users/:id/balance returns the current balance', async () => {
    const res = await request(app.getHttpServer())
      .get(`/users/${userId}/balance`)
      .expect(200);
    expect(res.body).toEqual({ id: userId, balance });
  });

  it('GET /users/:id/balance 404s for an unknown user', async () => {
    await request(app.getHttpServer()).get('/users/999999/balance').expect(404);
  });

  it('rejects malformed input before it ever reaches the DB', async () => {
    await request(app.getHttpServer())
      .post(`/users/${userId}/transactions`)
      .send({ action: 'PURCHASE', amount: 'not-a-number' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/users/${userId}/transactions`)
      .send({ action: 'NOT_A_REAL_ACTION', amount: '10.00' })
      .expect(400);
  });

  it('PURCHASE debits the balance and the read reflects it immediately (cache invalidated)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/users/${userId}/transactions`)
      .send({ action: 'PURCHASE', amount: '100.00' })
      .expect(201);

    const expected = (Number(balance) - 100).toFixed(2);
    expect(res.body.balance).toBe(expected);
    expect(res.body.transaction.amount).toBe('-100.00');

    const balanceRes = await request(app.getHttpServer())
      .get(`/users/${userId}/balance`)
      .expect(200);
    expect(balanceRes.body.balance).toBe(expected);

    balance = expected;
  });

  it('rejects a charge that would overdraw the account, leaving the balance untouched', async () => {
    await request(app.getHttpServer())
      .post(`/users/${userId}/transactions`)
      .send({ action: 'PURCHASE', amount: '999999999.00' })
      .expect(409);

    const res = await request(app.getHttpServer())
      .get(`/users/${userId}/balance`)
      .expect(200);
    expect(res.body.balance).toBe(balance);
  });

  it('never lets concurrent debits push the balance negative', async () => {
    const current = Number(balance);
    const target = 500;
    if (current !== target) {
      const action = current > target ? 'PURCHASE' : 'TOPUP';
      const amount = Math.abs(current - target).toFixed(2);
      const res = await request(app.getHttpServer())
        .post(`/users/${userId}/transactions`)
        .send({ action, amount })
        .expect(201);
      balance = res.body.balance;
    }
    expect(balance).toBe('500.00');

    const attempts = 10;
    const results = await Promise.all(
      Array.from({ length: attempts }, () =>
        request(app.getHttpServer())
          .post(`/users/${userId}/transactions`)
          .send({ action: 'PURCHASE', amount: '100.00' }),
      ),
    );

    const succeeded = results.filter((r) => r.status === 201).length;
    const failed = results.filter((r) => r.status === 409).length;

    expect(succeeded).toBe(5);
    expect(failed).toBe(5);

    const finalRes = await request(app.getHttpServer())
      .get(`/users/${userId}/balance`)
      .expect(200);
    expect(finalRes.body.balance).toBe('0.00');
    balance = finalRes.body.balance;
  });
});
