import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateClientDto {
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
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: ["FEMALE", "MALE", "OTHER", "UNSPECIFIED"] })
  @IsOptional()
  @IsEnum(["FEMALE", "MALE", "OTHER", "UNSPECIFIED"])
  sex?: "FEMALE" | "MALE" | "OTHER" | "UNSPECIFIED";

  @ApiPropertyOptional({ enum: ["PENDING", "ACTIVE", "INACTIVE"] })
  @IsOptional()
  @IsEnum(["PENDING", "ACTIVE", "INACTIVE"])
  status?: "PENDING" | "ACTIVE" | "INACTIVE";

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedMemberId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  tagIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  invitePortal?: boolean;
}

export class UpdateClientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: ["FEMALE", "MALE", "OTHER", "UNSPECIFIED"] })
  @IsOptional()
  @IsEnum(["FEMALE", "MALE", "OTHER", "UNSPECIFIED"])
  sex?: "FEMALE" | "MALE" | "OTHER" | "UNSPECIFIED";
}

export class ListClientsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: ["PENDING", "ACTIVE", "INACTIVE", "ARCHIVED"] })
  @IsOptional()
  @IsEnum(["PENDING", "ACTIVE", "INACTIVE", "ARCHIVED"])
  status?: "PENDING" | "ACTIVE" | "INACTIVE" | "ARCHIVED";

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tagId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedMemberId?: string;

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
  @Max(50)
  pageSize?: number;
}

export class RestoreClientDto {
  @ApiPropertyOptional({ enum: ["ACTIVE", "INACTIVE"] })
  @IsOptional()
  @IsEnum(["ACTIVE", "INACTIVE"])
  status?: "ACTIVE" | "INACTIVE";
}
