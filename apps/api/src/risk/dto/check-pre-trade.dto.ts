import { IsNumber, IsString, Min } from 'class-validator';

export class CheckPreTradeDto {
  @IsString()
  exchangeAccountId!: string;

  @IsString()
  pair!: string;

  @IsNumber()
  @Min(1)
  capital!: number;
}