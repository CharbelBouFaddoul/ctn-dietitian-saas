import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
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

const FOOD_QUANTITY_UNITS = ["g", "kg", "oz", "lb", "ml", "l", "fl_oz"] as const;
const FOOD_REFERENCE_UNITS = ["g", "ml"] as const;
const FOOD_ORIGINS = ["catalog", "custom", "all"] as const;
const FOOD_SORTS = ["name", "energy", "fat", "carbohydrate", "protein"] as const;
const FOOD_SORT_DIRS = ["asc", "desc"] as const;

export class ListFoodsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiPropertyOptional({ enum: FOOD_ORIGINS })
  @IsOptional()
  @IsEnum(FOOD_ORIGINS)
  origin?: (typeof FOOD_ORIGINS)[number];

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

  @ApiPropertyOptional({ enum: FOOD_SORTS })
  @IsOptional()
  @IsEnum(FOOD_SORTS)
  sort?: (typeof FOOD_SORTS)[number];

  @ApiPropertyOptional({ enum: FOOD_SORT_DIRS })
  @IsOptional()
  @IsEnum(FOOD_SORT_DIRS)
  sortDir?: (typeof FOOD_SORT_DIRS)[number];
}

export class CalculateFoodDto {
  @ApiProperty()
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiProperty({ enum: FOOD_QUANTITY_UNITS })
  @IsEnum(FOOD_QUANTITY_UNITS)
  unit!: (typeof FOOD_QUANTITY_UNITS)[number];
}

export class CreateCustomFoodDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  servingDescription?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.0001)
  referenceQuantity!: number;

  @ApiProperty({ enum: FOOD_REFERENCE_UNITS })
  @IsEnum(FOOD_REFERENCE_UNITS)
  referenceUnit!: (typeof FOOD_REFERENCE_UNITS)[number];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  energyKcal?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  proteinG?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  carbohydrateG?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fatG?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fiberG?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sugarG?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sodiumMg?: number | null;

  @ApiPropertyOptional({
    description: "Vitamins, minerals, and lipid extras (canonical micronutrient keys)",
    type: "object",
    additionalProperties: { type: "number", nullable: true },
  })
  @IsOptional()
  extraNutrients?: Record<string, number | null>;
}

export class UpdateCustomFoodDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  servingDescription?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  referenceQuantity?: number;

  @ApiPropertyOptional({ enum: FOOD_REFERENCE_UNITS })
  @IsOptional()
  @IsEnum(FOOD_REFERENCE_UNITS)
  referenceUnit?: (typeof FOOD_REFERENCE_UNITS)[number];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  energyKcal?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  proteinG?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  carbohydrateG?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fatG?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fiberG?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sugarG?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sodiumMg?: number | null;

  @ApiPropertyOptional({
    description: "Vitamins, minerals, and lipid extras (canonical micronutrient keys)",
    type: "object",
    additionalProperties: { type: "number", nullable: true },
  })
  @IsOptional()
  extraNutrients?: Record<string, number | null>;
}

export class UpsertFoodOverrideDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  energyKcal?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  proteinG?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  carbohydrateG?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fatG?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fiberG?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sugarG?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sodiumMg?: number | null;
}
