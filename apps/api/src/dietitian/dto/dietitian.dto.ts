import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  DATE_FORMATS,
  DISPLAY_ENERGY_UNITS,
  DISPLAY_HEIGHT_UNITS,
  DISPLAY_WEIGHT_UNITS,
  SUPPORTED_CURRENCIES,
} from "@nutrition-saas/config";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateNested,
} from "class-validator";
import { IanaTimeZoneConstraint, LocaleConstraint } from "./settings.validators";

export class DietitianSettingsInputDto {
  @ApiProperty({ example: "UTC" })
  @IsString()
  @Validate(IanaTimeZoneConstraint)
  timezone!: string;

  @ApiProperty({ example: "en" })
  @IsString()
  @Validate(LocaleConstraint)
  locale!: string;

  @ApiProperty({ enum: SUPPORTED_CURRENCIES })
  @IsIn([...SUPPORTED_CURRENCIES])
  currency!: (typeof SUPPORTED_CURRENCIES)[number];

  @ApiProperty({ enum: DISPLAY_WEIGHT_UNITS })
  @IsIn([...DISPLAY_WEIGHT_UNITS])
  weightUnit!: (typeof DISPLAY_WEIGHT_UNITS)[number];

  @ApiProperty({ enum: DISPLAY_HEIGHT_UNITS })
  @IsIn([...DISPLAY_HEIGHT_UNITS])
  heightUnit!: (typeof DISPLAY_HEIGHT_UNITS)[number];

  @ApiProperty({ enum: DATE_FORMATS })
  @IsIn([...DATE_FORMATS])
  dateFormat!: (typeof DATE_FORMATS)[number];
}

export class CreateDietitianDto {
  @ApiProperty({ example: "North Clinic" })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: "north-clinic" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  slug?: string;

  @ApiProperty({ type: DietitianSettingsInputDto })
  @ValidateNested()
  @Type(() => DietitianSettingsInputDto)
  settings!: DietitianSettingsInputDto;
}

export class UpdateDietitianDto {
  @ApiPropertyOptional({ example: "North Clinic" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

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
  @MaxLength(40)
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  professionalTitle?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  specialization?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  licenseNumber?: string | null;
}

export class UpdateDietitianSettingsDto extends DietitianSettingsInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  practiceName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  logoStorageKey?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressLine1?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressLine2?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  defaultAppointmentMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reminderEmailEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  reminderHoursBefore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  invoiceDefaultDueDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  invoiceDefaultTaxPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  invoiceFooter?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  emailFromName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  emailReplyTo?: string | null;

  @ApiPropertyOptional({ enum: DISPLAY_ENERGY_UNITS })
  @IsOptional()
  @IsIn([...DISPLAY_ENERGY_UNITS])
  energyUnit?: (typeof DISPLAY_ENERGY_UNITS)[number];

  @ApiPropertyOptional({ enum: ["SCHEDULED"] })
  @IsOptional()
  @IsIn(["SCHEDULED"])
  defaultAppointmentStatus?: "SCHEDULED";

  @ApiPropertyOptional({ type: [Number], example: [1, 24, 72] })
  @IsOptional()
  appointmentReminders?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  mealPlanShare?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  enabledMeasurements?: string[] | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  deduceMeasurements?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  portalPresets?: Record<string, unknown>;
}
