import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class TrackingDateQueryDto {
  @ApiPropertyOptional({ description: "Local calendar date YYYY-MM-DD in organization timezone" })
  @IsOptional()
  @IsString()
  date?: string;
}

const FOOD_UNITS = ["g", "kg", "oz", "lb", "ml", "l", "fl_oz"] as const;
const MEAL_CATEGORIES = ["BREAKFAST", "LUNCH", "DINNER", "SNACK", "OTHER"] as const;
const WATER_UNITS = ["ml", "l"] as const;
const INTENSITIES = ["LOW", "MODERATE", "HIGH"] as const;

export class CreateFoodLogDto {
  @ApiProperty()
  @IsUUID()
  foodId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiProperty({ enum: FOOD_UNITS })
  @IsEnum(FOOD_UNITS)
  unit!: (typeof FOOD_UNITS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  consumedAt?: string;

  @ApiPropertyOptional({ enum: MEAL_CATEGORIES })
  @IsOptional()
  @IsEnum(MEAL_CATEGORIES)
  mealCategory?: (typeof MEAL_CATEGORIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateFoodLogDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  foodId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  quantity?: number;

  @ApiPropertyOptional({ enum: FOOD_UNITS })
  @IsOptional()
  @IsEnum(FOOD_UNITS)
  unit?: (typeof FOOD_UNITS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  consumedAt?: string;

  @ApiPropertyOptional({ enum: MEAL_CATEGORIES })
  @IsOptional()
  @IsEnum(MEAL_CATEGORIES)
  mealCategory?: (typeof MEAL_CATEGORIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class CreateWaterLogDto {
  @ApiProperty()
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @ApiProperty({ enum: WATER_UNITS })
  @IsEnum(WATER_UNITS)
  unit!: (typeof WATER_UNITS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  loggedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateWaterLogDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  amount?: number;

  @ApiPropertyOptional({ enum: WATER_UNITS })
  @IsOptional()
  @IsEnum(WATER_UNITS)
  unit?: (typeof WATER_UNITS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  loggedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class CreateExerciseLogDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  activityType!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes!: number;

  @ApiPropertyOptional({ enum: INTENSITIES })
  @IsOptional()
  @IsEnum(INTENSITIES)
  intensity?: (typeof INTENSITIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  caloriesBurned?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  performedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateExerciseLogDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  activityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;

  @ApiPropertyOptional({ enum: INTENSITIES })
  @IsOptional()
  @IsEnum(INTENSITIES)
  intensity?: (typeof INTENSITIES)[number] | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  caloriesBurned?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  performedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class UpsertSleepLogDto {
  @ApiProperty()
  @IsString()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bedtime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wakeTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  quality?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpsertHabitLogDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  habitKey!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  habitLabel!: string;

  @ApiProperty()
  @IsString()
  date!: string;

  @ApiProperty()
  @IsBoolean()
  completed!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class LogPlannedMealDto {
  @ApiProperty()
  @IsUUID()
  mealId!: string;

  @ApiPropertyOptional({ description: "Local calendar date YYYY-MM-DD" })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ description: "Serving multiplier (default 1). Supports 0.25, 0.5, 1, 1.5, custom." })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  servings?: number;

  @ApiPropertyOptional({ description: "Client-generated UUID for idempotent retries" })
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}
