import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { THROTTLE_NAMES } from "@nutrition-saas/config";
import { ApiOkResponse, ApiOperation, ApiTags, ApiTooManyRequestsResponse } from "@nestjs/swagger";
import type { Request } from "express";
import { requestIp, requestUserAgent } from "../common/request-meta";
import { ContactSubmissionService } from "./contact-submission.service";
import { PublicContactDto } from "./dto/contact.dto";

@ApiTags("public")
@UseGuards(ThrottlerGuard)
@Throttle({ [THROTTLE_NAMES.AUTH]: {} })
@ApiTooManyRequestsResponse({ description: "Too many requests from this IP" })
@Controller("api/v1/public")
export class PublicContactController {
  constructor(private readonly submissions: ContactSubmissionService) {}

  @Post("contact")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Submit a public contact form message" })
  @ApiOkResponse()
  create(@Body() body: PublicContactDto, @Req() req: Request) {
    return this.submissions.create({
      name: body.name,
      email: body.email,
      subject: body.subject,
      message: body.message,
      planSlug: body.planSlug,
      ip: requestIp(req),
      userAgent: requestUserAgent(req),
    });
  }
}
