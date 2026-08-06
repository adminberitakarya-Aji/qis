import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ExchangeAccountService } from './exchange-account.service';
import { CreateExchangeAccountDto } from './dto/create-exchange-account.dto';

@Controller('exchange-accounts')
@UseGuards(JwtAuthGuard)
export class ExchangeAccountController {
  constructor(private readonly exchangeAccountService: ExchangeAccountService) {}

  @Post()
  async create(@CurrentUser() user: { id: string }, @Body() dto: CreateExchangeAccountDto) {
    const data = await this.exchangeAccountService.create(user.id, dto);
    return { success: true, message: 'Exchange account created', data };
  }

  @Get()
  async findAll(@CurrentUser() user: { id: string }) {
    const data = await this.exchangeAccountService.findAll(user.id);
    return { success: true, message: 'Exchange accounts retrieved', data };
  }

  @Delete(':id')
  async remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    await this.exchangeAccountService.remove(user.id, id);
    return { success: true, message: 'Exchange account removed' };
  }

  @Get(':id/balance')
  async getBalance(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    const data = await this.exchangeAccountService.getBalance(user.id, id);
    return { success: true, message: 'Exchange account balance retrieved', data };
  }
}