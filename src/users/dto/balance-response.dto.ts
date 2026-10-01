import { ApiProperty } from '@nestjs/swagger';

export class BalanceResponseDto {
  @ApiProperty({ example: 1, description: 'Идентификатор пользователя' })
  id: number;

  @ApiProperty({
    example: '900.00',
    description:
      'Текущий баланс в виде десятичной строки (не float — во избежание потери точности в JSON)',
  })
  balance: string;
}
