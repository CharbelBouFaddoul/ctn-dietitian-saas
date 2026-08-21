import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export class UpdatePortalMeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== "" && value != null)
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== "" && value != null)
  @IsDateString()
  dateOfBirth?: string | null;

  @ApiPropertyOptional({ enum: ["FEMALE", "MALE", "OTHER", "UNSPECIFIED"] })
  @IsOptional()
  @IsEnum(["FEMALE", "MALE", "OTHER", "UNSPECIFIED"])
  sex?: "FEMALE" | "MALE" | "OTHER" | "UNSPECIFIED";
}
