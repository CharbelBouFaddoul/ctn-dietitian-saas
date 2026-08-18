import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { THROTTLE_NAMES } from "@nutrition-saas/config";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser } from "../auth/auth.types";
import { ClientAccessService } from "../clients/client-access.service";
import { DocumentService } from "./document.service";
import { UpdateDocumentVisibilityDto } from "../messaging/dto/messaging.dto";
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";

interface UploadedFilePayload {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@ApiTags("portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/portal/documents")
export class PortalDocumentsController {
  constructor(
    private readonly access: ClientAccessService,
    private readonly documents: DocumentService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedRequestUser) {
    const client = await this.access.assertPortalAccess(user.id);
    return this.documents.listSharedForPortal(client);
  }

  @Get(":documentId/download")
  async download(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Res() res: Response,
  ) {
    const client = await this.access.assertPortalAccess(user.id);
    try {
      const document = await this.documents.getMetadata(documentId, client, true);
      const file = this.documents.openDownloadStream(document);
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.filename)}"`);
      res.setHeader("Cache-Control", "private, no-store");
      file.stream.pipe(res);
    } catch {
      await this.documents.recordDownloadDenied(user.id, client.organizationId, documentId);
      throw new NotFoundException("Document not found");
    }
  }

  @Post()
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } })
  @UseInterceptors(FileInterceptor("file"))
  @UseGuards(ThrottlerGuard)
  @Throttle({ [THROTTLE_NAMES.UPLOAD]: {} })
  async upload(@CurrentUser() user: AuthenticatedRequestUser, @UploadedFile() file: UploadedFilePayload) {
    const client = await this.access.assertPortalAccess(user.id);
    if (!file?.buffer?.length) {
      throw new NotFoundException("File is required");
    }
    return this.documents.upload({
      client,
      uploadedByUserId: user.id,
      buffer: file.buffer,
      originalFilename: file.originalname,
      declaredMime: file.mimetype,
      visibility: "SHARED",
    });
  }
}

@ApiTags("organizations")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId/clients/:clientId/documents")
export class ClientDocumentsController {
  constructor(
    private readonly access: ClientAccessService,
    private readonly documents: DocumentService,
  ) {}

  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    return this.documents.listForOrg(client, true);
  }

  @Post()
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  @UseGuards(ThrottlerGuard)
  @Throttle({ [THROTTLE_NAMES.UPLOAD]: {} })
  async upload(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @CurrentUser() user: AuthenticatedRequestUser,
    @UploadedFile() file: UploadedFilePayload,
    @Body() body: { visibility?: "INTERNAL" | "SHARED" },
  ) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    if (!file?.buffer?.length) {
      throw new NotFoundException("File is required");
    }
    return this.documents.upload({
      client,
      uploadedByUserId: user.id,
      buffer: file.buffer,
      originalFilename: file.originalname,
      declaredMime: file.mimetype,
      visibility: body.visibility === "SHARED" ? "SHARED" : "INTERNAL",
    });
  }

  @Get(":documentId/download")
  async download(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Res() res: Response,
  ) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    const document = await this.documents.getMetadata(documentId, client, false);
    const file = this.documents.openDownloadStream(document);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.filename)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    file.stream.pipe(res);
  }

  @Patch(":documentId/visibility")
  async visibility(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() body: UpdateDocumentVisibilityDto,
  ) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    return this.documents.setVisibility(documentId, client, user.id, body.visibility);
  }

  @Post(":documentId/archive")
  @ApiOperation({ summary: "Archive a client document" })
  async archive(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthenticatedRequestUser,
  ) {
    await this.access.assertCanAccess(tenant, clientId, "archive");
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    return this.documents.archive(documentId, client, user.id);
  }
}
