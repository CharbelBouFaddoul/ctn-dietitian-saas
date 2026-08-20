import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from "@nestjs/swagger";
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { InvoiceStatus } from "@prisma/client";
import { CurrentSession, CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import { ClientAccessService } from "../clients/client-access.service";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { ClientActionRequired } from "../clients/decorators/client-action.decorator";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { InvoiceService } from "./invoice.service";

class InvoiceItemDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @ApiProperty()
  @IsNumber()
  quantity!: number;

  @ApiProperty()
  @IsNumber()
  unitPrice!: number;
}

class CreateInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiProperty({ type: [InvoiceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

class UpdateInvoiceDto {
  @ApiPropertyOptional({ type: [InvoiceItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  issueDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}

@ApiTags("portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/portal/invoices")
export class PortalInvoicesController {
  constructor(
    private readonly access: ClientAccessService,
    private readonly invoices: InvoiceService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return this.invoices.listPortal(client);
  }

  @Get(":invoiceId")
  async get(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
  ) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return this.invoices.getPortal(client, invoiceId);
  }
}

@ApiTags("dietitian")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId")
export class OrganizationInvoicesController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get("invoices")
  list(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Query("clientId") clientId?: string,
    @Query("status") status?: InvoiceStatus,
    @Query("overdue") overdue?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.invoices.listForOrg(tenant, {
      clientId,
      status,
      overdue: overdue === "true",
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("invoices/:invoiceId")
  get(@CurrentTenant() tenant: DietitianTenantContext, @Param("invoiceId", ParseUUIDPipe) invoiceId: string) {
    return this.invoices.getForOrg(tenant, invoiceId);
  }

  @Get("invoices/:invoiceId/print")
  print(@CurrentTenant() tenant: DietitianTenantContext, @Param("invoiceId", ParseUUIDPipe) invoiceId: string) {
    return this.invoices.getPrintPayload(tenant, invoiceId);
  }

  @Post("clients/:clientId/invoices")
  @UseGuards(ClientAccessGuard)
  @ClientActionRequired("manageRecords")
  create(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: CreateInvoiceDto,
  ) {
    return this.invoices.createDraft(tenant, clientId, body);
  }

  @Get("clients/:clientId/invoices")
  @UseGuards(ClientAccessGuard)
  listForClient(@CurrentTenant() tenant: DietitianTenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.invoices.listForClient(tenant, clientId);
  }

  @Post("invoices")
  createWithClient(@CurrentTenant() tenant: DietitianTenantContext, @Body() body: CreateInvoiceDto) {
    if (!body.clientId) {
      throw new BadRequestException("clientId is required");
    }
    return this.invoices.createDraft(tenant, body.clientId, body);
  }

  @Patch("invoices/:invoiceId")
  update(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @Body() body: UpdateInvoiceDto,
  ) {
    return this.invoices.updateDraft(tenant, invoiceId, body);
  }

  @Post("invoices/:invoiceId/issue")
  issue(@CurrentTenant() tenant: DietitianTenantContext, @Param("invoiceId", ParseUUIDPipe) invoiceId: string) {
    return this.invoices.issue(tenant, invoiceId);
  }

  @Post("invoices/:invoiceId/send")
  send(@CurrentTenant() tenant: DietitianTenantContext, @Param("invoiceId", ParseUUIDPipe) invoiceId: string) {
    return this.invoices.send(tenant, invoiceId);
  }

  @Post("invoices/:invoiceId/pay")
  pay(@CurrentTenant() tenant: DietitianTenantContext, @Param("invoiceId", ParseUUIDPipe) invoiceId: string) {
    return this.invoices.markPaid(tenant, invoiceId);
  }

  @Post("invoices/:invoiceId/cancel")
  cancel(@CurrentTenant() tenant: DietitianTenantContext, @Param("invoiceId", ParseUUIDPipe) invoiceId: string) {
    return this.invoices.cancel(tenant, invoiceId);
  }

  @Post("invoices/:invoiceId/archive")
  archive(@CurrentTenant() tenant: DietitianTenantContext, @Param("invoiceId", ParseUUIDPipe) invoiceId: string) {
    return this.invoices.archive(tenant, invoiceId);
  }
}
