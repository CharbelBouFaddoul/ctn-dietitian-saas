import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class PublicContactDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  planSlug?: string;
}

export class AdminContactListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: ["inbox", "NEW", "READ", "ARCHIVED", "all"] })
  @IsOptional()
  @IsEnum(["inbox", "NEW", "READ", "ARCHIVED", "all"])
  status?: "inbox" | "NEW" | "READ" | "ARCHIVED" | "all";

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class UpdateContactSubmissionDto {
  @ApiProperty({ enum: ["NEW", "READ", "ARCHIVED"] })
  @IsEnum(["NEW", "READ", "ARCHIVED"])
  status!: "NEW" | "READ" | "ARCHIVED";
}
