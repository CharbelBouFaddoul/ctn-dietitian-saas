import { SetMetadata } from "@nestjs/common";
import type { ClientAction } from "../client-access.service";

export const CLIENT_ACTION_KEY = "clientAction";

export const ClientActionRequired = (action: ClientAction) => SetMetadata(CLIENT_ACTION_KEY, action);
