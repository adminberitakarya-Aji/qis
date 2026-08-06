import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { CreateExchangeAccountDto } from './dto/create-exchange-account.dto';

const MAX_EXCHANGE_ACCOUNTS = 5;

@Injectable()
export class ExchangeAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService
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

    const account = await this.prisma.exchangeAccount.create({
      data: {
        userId,
        exchange: dto.exchange,
        label: dto.label,
        apiKey: this.crypto.encrypt(dto.apiKey),
        apiSecret: this.crypto.encrypt(dto.apiSecret),
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
}