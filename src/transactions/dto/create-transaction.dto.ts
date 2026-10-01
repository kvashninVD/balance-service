import { ApiProperty } from '@nestjs/swagger';
import { TransactionAction } from '@prisma/client';
import { IsEnum, Matches } from 'class-validator';

const DECIMAL_STRING_REGEX = /^\d+(\.\d{1,2})?$/;

export class CreateTransactionDto {
  @ApiProperty({
    enum: TransactionAction,
    example: TransactionAction.PURCHASE,
    description:
      'Тип операции в журнале; определяет направление списание/начисление',
  })
  @IsEnum(TransactionAction)
  action: TransactionAction;

  @ApiProperty({
    example: '100.00',
    description:
      'Положительная десятичная сумма, не более 2 знаков после запятой, строкой',
  })
  @Matches(DECIMAL_STRING_REGEX, {
    message:
      'сумма должна быть положительной десятичной строкой с не более чем 2 знаками после запятой, например "100.00"',
  })
  amount: string;
}
