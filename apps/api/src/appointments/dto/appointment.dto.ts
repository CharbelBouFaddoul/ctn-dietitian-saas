import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export const APPOINTMENT_CATEGORIES = [
  "CONSULTATION",
  "FOLLOW_UP",
  "ASSESSMENT",
  "MEAL_PLAN",
  "OTHER",
] as const;

export const APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "RESCHEDULE_PENDING",
  "CANCELLATION_PENDING",
  "REQUESTED",
] as const;

export type AppointmentCategoryValue = (typeof APPOINTMENT_CATEGORIES)[number];
export type AppointmentStatusValue = (typeof APPOINTMENT_STATUSES)[number];

export class CreateAppointmentDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @ApiProperty({ enum: APPOINTMENT_CATEGORIES, required: false })
  @IsOptional()
  @IsEnum(APPOINTMENT_CATEGORIES)
  category?: AppointmentCategoryValue;

  @ApiProperty()
  @IsDateString()
  startAt!: string;

  @ApiProperty()
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateAppointmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ enum: APPOINTMENT_CATEGORIES })
  @IsOptional()
  @IsEnum(APPOINTMENT_CATEGORIES)
  category?: AppointmentCategoryValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ enum: ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"] })
  @IsOptional()
  @IsEnum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"])
  status?: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
}

export class UpdateAppointmentStatusDto {
  @ApiProperty({ enum: ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"] })
  @IsEnum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"])
  status!: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreatePortalAppointmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiProperty({ enum: APPOINTMENT_CATEGORIES, required: false })
  @IsOptional()
  @IsEnum(APPOINTMENT_CATEGORIES)
  category?: AppointmentCategoryValue;

  @ApiProperty()
  @IsDateString()
  startAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ProposeRescheduleDto {
  @ApiProperty()
  @IsDateString()
  startAt!: string;

  @ApiProperty()
  @IsDateString()
  endAt!: string;
}

export class AppointmentRangeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}
