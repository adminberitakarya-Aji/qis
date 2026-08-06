import { Module } from '@nestjs/common';
import { ExchangeAccountController } from './exchange-account.controller';
import { ExchangeAccountService } from './exchange-account.service';

@Module({
  controllers: [ExchangeAccountController],
  providers: [ExchangeAccountService],
  exports: [ExchangeAccountService],
})
export class ExchangeAccountModule {}
