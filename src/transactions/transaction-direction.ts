import { TransactionAction } from '@prisma/client';

export const TRANSACTION_DIRECTION: Record<TransactionAction, 1 | -1> = {
  [TransactionAction.PURCHASE]: -1,
  [TransactionAction.TOPUP]: 1,
  [TransactionAction.REFUND]: 1,
};
