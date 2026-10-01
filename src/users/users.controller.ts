import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { BalanceResponseDto } from './dto/balance-response.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id/balance')
  @ApiOperation({ summary: 'Получить текущий баланс пользователя (с кэшем)' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiResponse({ status: 200, type: BalanceResponseDto })
  @ApiResponse({ status: 404, description: 'Пользователь не найден' })
  getBalance(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<BalanceResponseDto> {
    return this.usersService.getBalance(id);
  }
}
