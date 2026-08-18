import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export class ConsentInputDto {
  @ApiProperty({ enum: ["TERMS_OF_SERVICE", "PRIVACY_POLICY"] })
  @IsEnum(["TERMS_OF_SERVICE", "PRIVACY_POLICY"])
  type!: "TERMS_OF_SERVICE" | "PRIVACY_POLICY";

  @ApiProperty({ example: "1.0" })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  policyVersion!: string;
}

export class RegisterDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ type: [ConsentInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ConsentInputDto)
  consents?: ConsentInputDto[];
}
