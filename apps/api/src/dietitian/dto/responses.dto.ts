import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class DietitianSettingsResponseDto {
  @ApiProperty()
  timezone!: string;

  @ApiProperty()
  locale!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  weightUnit!: string;

  @ApiProperty()
  heightUnit!: string;

  @ApiProperty()
  dateFormat!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  practiceName!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  logoStorageKey!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  contactEmail!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  contactPhone!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  addressLine1!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  addressLine2!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  city!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  region!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  postalCode!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  country!: string | null;

  @ApiProperty()
  defaultAppointmentMinutes!: number;

  @ApiProperty()
  reminderEmailEnabled!: boolean;

  @ApiProperty()
  reminderHoursBefore!: number;

  @ApiProperty()
  invoiceDefaultDueDays!: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  invoiceFooter!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  emailFromName!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  emailReplyTo!: string | null;
}

export class DietitianAccountResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ enum: ["PENDING", "ACTIVE", "SUSPENDED", "ARCHIVED"] })
  status!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ type: DietitianSettingsResponseDto })
  settings?: DietitianSettingsResponseDto;
}

export class DietitianTenantContextResponseDto {
  @ApiProperty()
  dietitianAccountId!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  accountStatus!: string;
}
