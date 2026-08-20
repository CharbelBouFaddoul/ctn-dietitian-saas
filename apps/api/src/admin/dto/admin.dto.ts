import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CATALOG_STATUSES, FEATURE_VALUE_TYPES, SUBSCRIPTION_STATUSES } from "@nutrition-saas/config";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class AdminSearchQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class AdminAuditQueryDto extends AdminSearchQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class UpdateOrganizationStatusDto {
  @ApiProperty({ enum: ["ACTIVE", "SUSPENDED", "ARCHIVED"] })
  @IsEnum(["ACTIVE", "SUSPENDED", "ARCHIVED"])
  status!: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}

export class AssignSubscriptionDto {
  @ApiProperty()
  @IsUUID()
  planId!: string;

  @ApiPropertyOptional({ enum: SUBSCRIPTION_STATUSES })
  @IsOptional()
  @IsEnum(SUBSCRIPTION_STATUSES)
  status?: (typeof SUBSCRIPTION_STATUSES)[number];
}

export class UpdateSubscriptionStatusDto {
  @ApiProperty({ enum: SUBSCRIPTION_STATUSES })
  @IsEnum(SUBSCRIPTION_STATUSES)
  status!: (typeof SUBSCRIPTION_STATUSES)[number];
}

export class UpsertFeatureOverrideDto {
  @ApiPropertyOptional({ nullable: true, type: Boolean })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  limitValue?: number | null;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: ["ACTIVE", "SUSPENDED", "ARCHIVED"] })
  @IsEnum(["ACTIVE", "SUSPENDED", "ARCHIVED"])
  status!: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}

export class UpdatePlatformRoleDto {
  @ApiProperty({ enum: ["SUPER_ADMIN", "ADMIN"], nullable: true })
  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(["SUPER_ADMIN", "ADMIN"])
  platformRole!: "SUPER_ADMIN" | "ADMIN" | null;
}

export class ProvisionDietitianDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(320)
  email!: string;

  @ApiPropertyOptional({ description: "Practice display name" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ description: "Alias for displayName" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planId?: string;
}

export class CreatePlanDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(64)
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: CATALOG_STATUSES })
  @IsOptional()
  @IsEnum(CATALOG_STATUSES)
  status?: (typeof CATALOG_STATUSES)[number];
}

export class PlanFeatureInputDto {
  @ApiProperty()
  @IsUUID()
  featureId!: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  limitValue?: number | null;
}

export class ReplacePlanFeaturesDto {
  @ApiProperty({ type: [PlanFeatureInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureInputDto)
  features!: PlanFeatureInputDto[];
}

export class CreateFeatureDto {
  @ApiProperty({ example: "AI" })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  @MaxLength(64)
  key!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: FEATURE_VALUE_TYPES })
  @IsEnum(FEATURE_VALUE_TYPES)
  valueType!: (typeof FEATURE_VALUE_TYPES)[number];
}

export class UpdateFeatureDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: CATALOG_STATUSES })
  @IsOptional()
  @IsEnum(CATALOG_STATUSES)
  status?: (typeof CATALOG_STATUSES)[number];
}
