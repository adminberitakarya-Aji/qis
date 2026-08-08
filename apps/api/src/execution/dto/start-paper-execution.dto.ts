import { IsString, IsIn } from 'class-validator';

export class StartPaperExecutionDto {
  @IsString()
  blueprintId!: string;

  @IsString()
  @IsIn(['binance', 'bybit'])
  exchange!: 'binance' | 'bybit';
}