import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { ExchangeName } from '@qis/shared';

export class CreateExchangeAccountDto {
  @IsEnum(['binance', 'bybit'] as const)
  exchange!: ExchangeName;

  @IsString()
  @MaxLength(50)
  label!: string;

  @IsString()
  @MinLength(1)
  apiKey!: string;

  @IsString()
  @MinLength(1)
  apiSecret!: string;
}