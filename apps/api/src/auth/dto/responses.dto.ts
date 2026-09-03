import { ApiProperty } from "@nestjs/swagger";

export class RegisterResponseDto {
  @ApiProperty()
  message!: string;

  @ApiProperty()
  emailVerificationRequired!: boolean;

  @ApiProperty({ nullable: true, type: String })
  dietitianAccountId!: string | null;
}

export class MessageResponseDto {
  @ApiProperty()
  message!: string;
}

export class PublicUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true, type: String })
  firstName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  lastName!: string | null;

  @ApiProperty({ enum: ["PENDING", "ACTIVE", "SUSPENDED", "ARCHIVED"] })
  status!: string;

  @ApiProperty({ enum: ["SUPER_ADMIN", "ADMIN"], nullable: true })
  platformRole!: string | null;

  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  emailVerifiedAt!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class PublicSessionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiProperty()
  lastUsedAt!: string;
}

export class AuthMeResponseDto {
  @ApiProperty({ type: PublicUserDto })
  user!: PublicUserDto;

  @ApiProperty({ type: PublicSessionDto })
  session!: PublicSessionDto;
}

export class ValidationErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ type: [String], example: ["email must be an email"] })
  message!: string[];

  @ApiProperty({ example: "Bad Request" })
  error!: string;
}

export class UnauthorizedErrorResponseDto {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({ example: "Invalid email or password" })
  message!: string;

  @ApiProperty({ example: "Unauthorized" })
  error!: string;
}
