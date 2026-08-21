import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { DocumentVisibility } from "@prisma/client";

export class SendMessageDto {
  @IsString()
  @MaxLength(10_000)
  body!: string;
}

export class DeleteMessageDto {
  @IsIn(["me", "everyone"])
  scope!: "me" | "everyone";
}

export class MarkConversationReadDto {
  @IsOptional()
  @IsString()
  readAt?: string;
}

export class MessagePaginationQueryDto {
  @IsOptional()
  @IsString()
  before?: string;

  @IsOptional()
  limit?: number;
}

export class UploadDocumentDto {
  @IsOptional()
  @IsEnum(DocumentVisibility)
  visibility?: DocumentVisibility;
}

export class UpdateDocumentVisibilityDto {
  @IsIn(["INTERNAL", "SHARED"])
  visibility!: DocumentVisibility;
}

export class NotificationReadParamDto {
  @IsUUID()
  notificationId!: string;
}
