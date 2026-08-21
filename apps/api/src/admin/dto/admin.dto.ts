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
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
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

export class AdminUsersListQueryDto extends AdminSearchQueryDto {
  @ApiPropertyOptional({ enum: ["app", "platform", "all"], description: "app = dietitians/patients only (default); platform = admins; all = no scope filter" })
  @IsOptional()
  @IsEnum(["app", "platform", "all"])
  scope?: "app" | "platform" | "all";

  @ApiPropertyOptional({ enum: ["dietitian", "patient", "all"], description: "Account type filter (app scope only)" })
  @IsOptional()
  @IsEnum(["dietitian", "patient", "all"])
  type?: "dietitian" | "patient" | "all";

  @ApiPropertyOptional({ enum: ["PENDING", "ACTIVE", "SUSPENDED", "ARCHIVED"] })
  @IsOptional()
  @IsEnum(["PENDING", "ACTIVE", "SUSPENDED", "ARCHIVED"])
  status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";

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

export class AdminAuditQueryDto extends AdminSearchQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dietitianAccountId?: string;
}

export class UpdateDietitianAccountStatusDto {
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

  @ApiPropertyOptional({
    description: "ISO-8601 period end. Omit or null for open-ended ACTIVE access.",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  currentPeriodEnd?: string | null;

  @ApiPropertyOptional({ description: "ISO-8601 period start", nullable: true })
  @IsOptional()
  @IsString()
  currentPeriodStart?: string | null;

  @ApiPropertyOptional({ enum: ["MONTHLY", "YEARLY"], nullable: true })
  @IsOptional()
  @IsEnum(["MONTHLY", "YEARLY"])
  billingCycle?: "MONTHLY" | "YEARLY" | null;
}

export class RenewSubscriptionDto {
  @ApiPropertyOptional({ description: "Optional plan change on renew" })
  @IsOptional()
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional({
    description: "ISO-8601 new period end. Omit or null for open-ended.",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  currentPeriodEnd?: string | null;

  @ApiPropertyOptional({ enum: ["MONTHLY", "YEARLY"], nullable: true })
  @IsOptional()
  @IsEnum(["MONTHLY", "YEARLY"])
  billingCycle?: "MONTHLY" | "YEARLY" | null;
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

export class UpdateAdminUserProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ description: "Leave empty to keep the current password" })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}

export class UpdatePlatformRoleDto {
  @ApiProperty({ enum: ["ADMIN"], nullable: true, description: "Single platform admin role, or null to remove access" })
  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(["ADMIN"])
  platformRole!: "ADMIN" | null;
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
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  professionalTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  specialization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional({ description: "Optional CLIENT_LIMIT override after plan assignment" })
  @IsOptional()
  @IsInt()
  @Min(0)
  clientLimit?: number;
}

export class ProvisionPatientDto {
  @ApiProperty({ description: "DietitianAccount.id — required practice assignment" })
  @IsUUID()
  dietitianAccountId!: string;

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
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ description: "YYYY-MM-DD" })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: ["FEMALE", "MALE", "OTHER", "UNSPECIFIED"] })
  @IsOptional()
  @IsEnum(["FEMALE", "MALE", "OTHER", "UNSPECIFIED"])
  sex?: "FEMALE" | "MALE" | "OTHER" | "UNSPECIFIED";

  @ApiPropertyOptional({ description: "Stored on ClientProfile.lifestyle" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  activityLevel?: string;

  @ApiPropertyOptional({ description: "Initial height in cm" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  heightCm?: number;

  @ApiPropertyOptional({ description: "Initial weight in kg" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @ApiPropertyOptional({
    description:
      "Default true when email is provided, false when absent. True without email is invalid.",
  })
  @IsOptional()
  @IsBoolean()
  inviteToPortal?: boolean;
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
