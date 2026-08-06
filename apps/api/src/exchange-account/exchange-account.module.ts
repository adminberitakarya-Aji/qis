import { Module } from '@nestjs/common';
import { ExchangeAccountController } from './exchange-account.controller';
import { ExchangeAccountService } from './exchange-account.service';
import { CryptoService } from '../common/crypto.service';

@Module({
  controllers: [ExchangeAccountController],
  providers: [ExchangeAccountService, CryptoService],
  exports: [ExchangeAccountService, CryptoService],
})
export class ExchangeAccountModule {}