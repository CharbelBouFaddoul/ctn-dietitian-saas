import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { MessageResponseDto, ValidationErrorResponseDto } from "../auth/dto/responses.dto";
import { ResetPasswordDto } from "../auth/dto/reset-password.dto";
import { TokenDto } from "../auth/dto/token.dto";
import { ClientAccountService } from "./client-account.service";

@ApiTags("auth")
@Controller("api/v1/auth/invitations")
export class ClientInvitationController {
  constructor(private readonly accounts: ClientAccountService) {}

  @Post("preview")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Preview a client portal invitation without consuming it" })
  @ApiBadRequestResponse({ type: ValidationErrorResponseDto })
  preview(@Body() body: TokenDto) {
    return this.accounts.previewInvitation(body.token);
  }

  @Post("accept")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Activate a client portal account",
    description: "Sets the password on the users identity. Does not create an organization membership.",
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ type: ValidationErrorResponseDto })
  accept(@Body() body: ResetPasswordDto): Promise<MessageResponseDto> {
    return this.accounts.acceptInvitation(body.token, body.password);
  }
}
