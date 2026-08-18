import { ApiProperty } from "@nestjs/swagger";
import { ORGANIZATION_ROLES } from "@nutrition-saas/config";
import { IsEmail, IsIn, IsUUID } from "class-validator";

export class AddMemberDto {
  @ApiProperty({ example: "dietitian@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: ["DIETITIAN", "STAFF"] })
  @IsIn(["DIETITIAN", "STAFF"])
  role!: "DIETITIAN" | "STAFF";
}

export class ChangeMemberRoleDto {
  @ApiProperty({ enum: ORGANIZATION_ROLES })
  @IsIn([...ORGANIZATION_ROLES])
  role!: (typeof ORGANIZATION_ROLES)[number];
}

export class TransferOwnershipDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  membershipId!: string;
}
