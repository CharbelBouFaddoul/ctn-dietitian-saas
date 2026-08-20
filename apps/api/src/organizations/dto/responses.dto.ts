import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class OrganizationSettingsResponseDto {
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

export class OrganizationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ enum: ["PENDING", "ACTIVE", "SUSPENDED", "ARCHIVED"] })
  status!: string;

  @ApiProperty({ enum: ["OWNER", "DIETITIAN", "STAFF"] })
  role!: string;

  @ApiProperty({ enum: ["ACTIVE", "DEACTIVATED"] })
  membershipStatus!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ type: OrganizationSettingsResponseDto })
  settings?: OrganizationSettingsResponseDto;
}

export class OrganizationMemberResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: ["OWNER", "DIETITIAN", "STAFF"] })
  role!: string;

  @ApiProperty({ enum: ["ACTIVE", "DEACTIVATED"] })
  status!: string;

  @ApiProperty()
  joinedAt!: string;

  @ApiProperty({ nullable: true, type: String })
  deactivatedAt!: string | null;
}

export class DietitianTenantContextResponseDto {
  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  organizationName!: string;

  @ApiProperty()
  organizationStatus!: string;

  @ApiProperty()
  membershipId!: string;

  @ApiProperty()
  role!: string;
}
