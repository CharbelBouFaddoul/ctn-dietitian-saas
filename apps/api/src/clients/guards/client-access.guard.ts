import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { CLIENT_ACCESS_DENIED } from "../client.messages";
import { ClientAccessService, type ClientAction } from "../client-access.service";
import { CLIENT_ACTION_KEY } from "../decorators/client-action.decorator";

@Injectable()
export class ClientAccessGuard implements CanActivate {
  constructor(
    private readonly access: ClientAccessService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const tenant = req.tenant;
    const clientId = req.params.clientId;
    const action =
      this.reflector.getAllAndOverride<ClientAction>(CLIENT_ACTION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? "read";

    if (!tenant || typeof clientId !== "string") {
      throw new ForbiddenException(CLIENT_ACCESS_DENIED);
    }

    req.client = await this.access.assertCanAccess(tenant, clientId, action);
    return true;
  }
}
