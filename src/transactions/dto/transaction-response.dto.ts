import { ApiProperty } from '@nestjs/swagger';
import { TransactionAction } from '@prisma/client';
import { BalanceResponseDto } from '../../users/dto/balance-response.dto';

export class LedgerEntryDto {
  @ApiProperty({ example: 42 })
  id: number;

  @ApiProperty({ enum: TransactionAction, example: TransactionAction.PURCHASE })
  action: TransactionAction;

  @ApiProperty({
    example: '-100.00',
    description:
      'Сумма со знаком, как хранится в истории (отрицательная — списание, положительная — начисление)',
  })
  amount: string;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  ts: Date;
}

export class TransactionResponseDto extends BalanceResponseDto {
  @ApiProperty({ type: LedgerEntryDto })
  transaction: LedgerEntryDto;
}
