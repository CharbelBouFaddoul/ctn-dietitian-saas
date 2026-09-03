import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminCatalogService } from "./admin-catalog.service";

@ApiTags("public")
@Controller("api/v1/public")
export class PublicPlansController {
  constructor(private readonly catalog: AdminCatalogService) {}

  @Get("plans")
  @ApiOperation({ summary: "List active subscription plans for marketing" })
  @ApiOkResponse()
  list() {
    return this.catalog.listPublicPlans();
  }

  @Get("features")
  @ApiOperation({ summary: "List active catalog features for marketing" })
  @ApiOkResponse()
  listFeatures() {
    return this.catalog.listPublicFeatures();
  }
}
