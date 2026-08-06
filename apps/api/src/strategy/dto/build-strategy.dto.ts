import { IsArray, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class BuildStrategyDto {
  @IsString()
  @IsIn(['binance', 'bybit'])
  exchange!: 'binance' | 'bybit';

  @IsString()
  pair!: string;

  @IsNumber()
  @Min(10)
  capital!: number;

  @IsNumber()
  @IsIn([1, 2, 3])
  sectionCount!: 1 | 2 | 3;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  capitalAllocationPercent?: number[];

  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high'])
  riskPreference?: 'low' | 'medium' | 'high';
}
