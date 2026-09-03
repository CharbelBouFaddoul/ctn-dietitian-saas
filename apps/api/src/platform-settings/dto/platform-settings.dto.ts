import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class SiteNavItemDto {
  @IsString()
  @MaxLength(200)
  href!: string;

  @IsString()
  @MaxLength(80)
  label!: string;

  @IsBoolean()
  visible!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  order!: number;
}

export class SiteFooterLinkDto {
  @IsString()
  @MaxLength(200)
  href!: string;

  @IsString()
  @MaxLength(80)
  label!: string;
}

export class SiteFooterGroupDto {
  @IsString()
  @MaxLength(80)
  title!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SiteFooterLinkDto)
  @ArrayMaxSize(20)
  links!: SiteFooterLinkDto[];
}

export class SiteSocialLinkDto {
  @IsString()
  @MaxLength(80)
  label!: string;

  @IsString()
  @MaxLength(300)
  href!: string;
}

export class UpdatePlatformSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brandText?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional({ enum: ["LOGO", "TEXT", "LOGO_AND_TEXT"] })
  @IsOptional()
  @IsEnum(["LOGO", "TEXT", "LOGO_AND_TEXT"])
  brandDisplay?: "LOGO" | "TEXT" | "LOGO_AND_TEXT";

  @ApiPropertyOptional({ type: [SiteNavItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SiteNavItemDto)
  @ArrayMaxSize(20)
  navItems?: SiteNavItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  ctaText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ctaHref?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ctaVisible?: boolean;

  @ApiPropertyOptional({
    description:
      "Legacy shorthand: sets both dietitian and patient registration. Prefer the audience-specific flags.",
  })
  @IsOptional()
  @IsBoolean()
  registrationEnabled?: boolean;

  @ApiPropertyOptional({ description: "Allow self-serve dietitian (clinic) registration." })
  @IsOptional()
  @IsBoolean()
  dietitianRegistrationEnabled?: boolean;

  @ApiPropertyOptional({ description: "Allow self-serve patient registration." })
  @IsOptional()
  @IsBoolean()
  patientRegistrationEnabled?: boolean;

  @ApiPropertyOptional({
    description: "When false, the public Plans page is hidden and Get Started goes to Contact.",
  })
  @IsOptional()
  @IsBoolean()
  plansPageEnabled?: boolean;

  @ApiPropertyOptional({
    description: "When false, product emails (invoice, automation) are skipped. Auth emails always send.",
  })
  @IsOptional()
  @IsBoolean()
  emailNotificationsEnabled?: boolean;

  @ApiPropertyOptional({
    description: "When true, new accounts must verify email before sign-in.",
  })
  @IsOptional()
  @IsBoolean()
  emailVerificationRequired?: boolean;

  @ApiPropertyOptional({
    description: "When true, plan buttons go to online checkout; when false they go to Contact.",
  })
  @IsOptional()
  @IsBoolean()
  onlineCheckoutEnabled?: boolean;

  @ApiPropertyOptional({
    description: "When true, self-serve dietitian signup receives a trial subscription.",
  })
  @IsOptional()
  @IsBoolean()
  trialSignupEnabled?: boolean;

  @ApiPropertyOptional({ description: "Trial length in days." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  trialDurationDays?: number;

  @ApiPropertyOptional({ description: "Plan slug assigned to new trial practices." })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  trialPlanSlug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  dietitianSignInLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  patientSignInLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  footerDescription?: string;

  @ApiPropertyOptional({ type: [SiteFooterGroupDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SiteFooterGroupDto)
  @ArrayMaxSize(10)
  footerGroups?: SiteFooterGroupDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  copyrightText?: string;

  @ApiPropertyOptional({ type: [SiteSocialLinkDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SiteSocialLinkDto)
  @ArrayMaxSize(20)
  socialLinks?: SiteSocialLinkDto[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactEmail?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactPhone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  contactAddress?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactHours?: string | null;
}
