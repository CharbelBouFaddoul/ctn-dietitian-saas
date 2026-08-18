import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class TokenDto {
  @ApiProperty({ description: "Raw single-use token from the emailed link" })
  @IsString()
  @MinLength(16)
  token!: string;
}
