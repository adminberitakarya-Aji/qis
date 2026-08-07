import { IsArray, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BacktestSectionDto {
  @IsNumber()
  index!: number;

  @IsNumber()
  @Min(0)
  allocationPercent!: number;

  @IsNumber()
  @Min(1)
  gridCount!: number;

  @IsNumber()
  @Min(0)
  gridDistancePercent!: number;

  @IsNumber()
  @Min(0)
  sectionGapPercent!: number;

  @IsNumber()
  @Min(0)
  minNetProfitPercent!: number;
}

export class RunBacktestDto {
  @IsString()
  @IsIn(['binance', 'bybit'])
  exchange!: 'binance' | 'bybit';

  @IsString()
  pair!: string;

  @IsNumber()
  @Min(10)
  tradingCapital!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BacktestSectionDto)
  sections!: BacktestSectionDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  buyFeePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellFeePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedSlippagePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  candleLimit?: number;

  @IsOptional()
  @IsString()
  timeframe?: string;
}