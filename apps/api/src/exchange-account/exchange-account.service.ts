import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExchangeAccountDto } from './dto/create-exchange-account.dto';
import { EXCHANGE_ENGINE } from '../engines/engines.module';
import { ExchangeEngine } from '@qis/exchange-engine';

const MAX_EXCHANGE_ACCOUNTS = 5;

@Injectable()
export class ExchangeAccountService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXCHANGE_ENGINE) private readonly exchangeEngine: ExchangeEngine,
  ) {}

  async create(userId: string, dto: CreateExchangeAccountDto) {
    const count = await this.prisma.exchangeAccount.count({ where: { userId } });

    if (count >= MAX_EXCHANGE_ACCOUNTS) {
      throw new BadRequestException(`Maximum ${MAX_EXCHANGE_ACCOUNTS} exchange accounts per user`);
    }

    const existing = await this.prisma.exchangeAccount.findUnique({
      where: {
        userId_exchange_label: {
          userId,
          exchange: dto.exchange,
          label: dto.label,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(`Exchange account label "${dto.label}" already exists for ${dto.exchange}`);
    }

    // Encryption is delegated to Exchange Engine, which is the sole holder of
    // the Master Key. The API service never touches plaintext secrets beyond
    // this function scope, and Exchange Engine never returns the ciphertext
    // back to the caller.
    const encrypted = this.exchangeEngine.encryptCredentials(dto.apiKey, dto.apiSecret);

    const account = await this.prisma.exchangeAccount.create({
      data: {
        userId,
        exchange: dto.exchange,
        label: dto.label,
        apiKeyEncrypted: encrypted.apiKeyEncrypted,
        apiKeyKeyVersion: encrypted.apiKeyKeyVersion,
        apiSecretEncrypted: encrypted.apiSecretEncrypted,
        apiSecretKeyVersion: encrypted.apiSecretKeyVersion,
      },
    });

    // Never return decrypted secrets — strip them from the response.
    return {
      id: account.id,
      exchange: account.exchange,
      label: account.label,
      isActive: account.isActive,
      createdAt: account.createdAt,
    };
  }

  async findAll(userId: string) {
    const accounts = await this.prisma.exchangeAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return accounts.map((a) => ({
      id: a.id,
      exchange: a.exchange,
      label: a.label,
      isActive: a.isActive,
      createdAt: a.createdAt,
    }));
  }

  async remove(userId: string, id: string) {
    const account = await this.prisma.exchangeAccount.findUnique({ where: { id } });

    if (!account) {
      throw new NotFoundException('Exchange account not found');
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('You do not own this exchange account');
    }

    await this.prisma.exchangeAccount.delete({ where: { id } });
  }

  async getBalance(userId: string, accountId: string) {
    const account = await this.prisma.exchangeAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException('Exchange account not found');
    }
    if (account.userId !== userId) {
      throw new ForbiddenException('You do not own this exchange account');
    }

    // Per Secret Ownership Rule #5: API service only forwards the ciphertext
    // + audit context. Decryption happens inside Exchange Engine, which logs
    // the event and never returns the plaintext to this scope.
    return this.exchangeEngine.fetchBalanceEncrypted(
      account.exchange as 'binance' | 'bybit',
      account.apiKeyEncrypted,
      account.apiSecretEncrypted,
      {
        exchangeAccountId: account.id,
        userId: account.userId,
        purpose: 'fetchBalance',
      },
    );
  }
}
