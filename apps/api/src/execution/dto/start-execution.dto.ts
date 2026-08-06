import { IsString, IsNotEmpty } from 'class-validator';

export class StartExecutionDto {
  @IsNotEmpty()
  @IsString()
  blueprintId!: string;

  @IsNotEmpty()
  @IsString()
  exchangeAccountId!: string;
}
