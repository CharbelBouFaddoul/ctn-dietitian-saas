import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { ContactSubmissionService } from "./contact-submission.service";
import { AdminContactListQueryDto, UpdateContactSubmissionDto } from "./dto/contact.dto";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";

@ApiTags("admin")
@ApiCookieAuth()
@UseGuards(SessionGuard, PlatformRolesGuard)
@Controller("api/v1/admin")
export class AdminContactController {
  constructor(private readonly submissions: ContactSubmissionService) {}

  @Get("contact-messages")
  @ApiOperation({ summary: "List public contact form submissions" })
  list(@Query() query: AdminContactListQueryDto) {
    return this.submissions.list(query);
  }

  @Get("contact-messages/:id")
  @ApiOperation({ summary: "Get a contact form submission" })
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.submissions.get(id);
  }

  @Patch("contact-messages/:id")
  @ApiOperation({ summary: "Update contact submission status" })
  update(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateContactSubmissionDto) {
    return this.submissions.updateStatus(id, body.status);
  }

  @Delete("contact-messages/:id")
  @ApiOperation({ summary: "Delete a contact form submission" })
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.submissions.remove(id);
  }
}
