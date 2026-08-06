import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { CryptoService } from '../common/crypto.service';

@Module({
  controllers: [PortfolioController],
  providers: [PortfolioService, CryptoService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
