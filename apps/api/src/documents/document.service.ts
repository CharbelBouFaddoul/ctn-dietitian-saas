import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "@nutrition-saas/validation";
import type { Client, Document, DocumentVisibility } from "@prisma/client";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { TimelineService } from "../timeline/timeline.service";
import { NotificationService } from "../notifications/notification.service";
import { MessagingRecipientService } from "../messaging/messaging-recipient.service";
import { requireDietitianAccountId } from "../dietitian/tenant-scope";
import {
  assertAllowedUpload,
  detectMime,
  extensionFromFilename,
  sanitizeFilename,
} from "./file-validation";

@Injectable()
export class DocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly security: SecurityEventLogger,
    private readonly timeline: TimelineService,
    private readonly notifications: NotificationService,
    private readonly recipients: MessagingRecipientService,
  ) {}

  async listForOrg(client: Client, includeInternal: boolean) {
    const dietitianAccountId = requireDietitianAccountId(client);
    const rows = await this.prisma.document.findMany({
      where: {
        dietitianAccountId,
        clientId: client.id,
        status: "ACTIVE",
        ...(includeInternal ? {} : { visibility: "SHARED" }),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((row) => this.toResponse(row));
  }

  async listSharedForPortal(client: Client) {
    const dietitianAccountId = requireDietitianAccountId(client);
    const rows = await this.prisma.document.findMany({
      where: {
        dietitianAccountId,
        clientId: client.id,
        status: "ACTIVE",
        visibility: "SHARED",
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((row) => this.toResponse(row));
  }

  async getMetadata(documentId: string, client: Client, portal: boolean): Promise<Document> {
    const document = await this.findScoped(documentId, requireDietitianAccountId(client), client.id);
    this.assertReadable(document, portal);
    return document;
  }

  async upload(input: {
    client: Client;
    uploadedByUserId: string;
    buffer: Buffer;
    originalFilename: string;
    declaredMime: string;
    visibility: DocumentVisibility;
  }) {
    const sizeBytes = input.buffer.length;
    const maxBytes = this.config.get("MAX_DOCUMENT_BYTES", { infer: true });
    if (sizeBytes <= 0) {
      throw new BadRequestException("Empty files are not allowed");
    }
    if (sizeBytes > maxBytes) {
      throw new PayloadTooLargeException("File exceeds maximum size");
    }

    const detected = detectMime(input.buffer.subarray(0, Math.min(input.buffer.length, 512)));
    let mime: string;
    try {
      mime = assertAllowedUpload(detected, input.declaredMime);
    } catch {
      throw new UnsupportedMediaTypeException("Unsupported file type");
    }

    const documentId = randomUUID();
    const safeName = sanitizeFilename(input.originalFilename);
    const ext = extensionFromFilename(safeName);
    const storageKey = this.storage.buildDocumentKey(
      requireDietitianAccountId(input.client),
      input.client.id,
      documentId,
      ext,
    );

    await this.storage.writeStreamToKey(storageKey, Readable.from(input.buffer));

    const dietitianAccountId = requireDietitianAccountId(input.client);
    const document = await this.prisma.document.create({
      data: {
        id: documentId,
        dietitianAccountId,
        clientId: input.client.id,
        uploadedByUserId: input.uploadedByUserId,
        filename: safeName,
        originalFilename: safeName,
        storageKey,
        mimeType: mime,
        sizeBytes: BigInt(sizeBytes),
        visibility: input.visibility,
        sharedAt: input.visibility === "SHARED" ? new Date() : null,
        sharedByUserId: input.visibility === "SHARED" ? input.uploadedByUserId : null,
      },
    });

    await this.timeline.record({
      dietitianAccountId: dietitianAccountId,
      clientId: input.client.id,
      type: "DOCUMENT_UPLOADED",
      actorUserId: input.uploadedByUserId,
      targetType: "document",
      targetId: document.id,
    });

    await this.security.record({
      type: "document_uploaded",
      outcome: "success",
      userId: input.uploadedByUserId,
      dietitianAccountId,
      targetType: "document",
      targetId: document.id,
      metadata: { mimeType: mime, sizeBytes },
    });

    if (input.visibility === "SHARED") {
      await this.onShared(document, input.uploadedByUserId);
    } else {
      await this.notifyStaffDocumentUploaded(document, input.uploadedByUserId);
    }

    return this.toResponse(document);
  }

  async setVisibility(documentId: string, client: Client, userId: string, visibility: DocumentVisibility) {
    const document = await this.findScoped(documentId, requireDietitianAccountId(client), client.id);
    if (document.status !== "ACTIVE") {
      throw new NotFoundException("Document not found");
    }
    const updated = await this.prisma.document.update({
      where: { id: document.id },
      data: {
        visibility,
        sharedAt: visibility === "SHARED" ? new Date() : null,
        sharedByUserId: visibility === "SHARED" ? userId : null,
      },
    });

    if (visibility === "SHARED") {
      await this.timeline.record({
        dietitianAccountId: requireDietitianAccountId(client),
        clientId: client.id,
        type: "DOCUMENT_SHARED",
        actorUserId: userId,
        targetType: "document",
        targetId: document.id,
      });
      await this.security.record({
        type: "document_shared",
        outcome: "success",
        userId,
        targetType: "document",
        targetId: document.id,
      });
      await this.onShared(updated, userId);
    } else {
      await this.security.record({
        type: "document_unshared",
        outcome: "success",
        userId,
        targetType: "document",
        targetId: document.id,
      });
    }

    return this.toResponse(updated);
  }

  async archive(documentId: string, client: Client, userId: string) {
    const document = await this.findScoped(documentId, requireDietitianAccountId(client), client.id);
    if (document.status === "ARCHIVED") {
      return this.toResponse(document);
    }
    const updated = await this.prisma.document.update({
      where: { id: document.id },
      data: { status: "ARCHIVED", archivedAt: new Date(), visibility: "INTERNAL" },
    });
    await this.timeline.record({
      dietitianAccountId: requireDietitianAccountId(client),
      clientId: client.id,
      type: "DOCUMENT_ARCHIVED",
      actorUserId: userId,
      targetType: "document",
      targetId: document.id,
    });
    await this.security.record({
      type: "document_archived",
      outcome: "success",
      userId,
      targetType: "document",
      targetId: document.id,
    });
    return this.toResponse(updated);
  }

  async openDownloadStream(document: Document) {
    const onDisk = await this.storage.exists(document.storageKey);
    if (!onDisk) {
      throw new NotFoundException("File missing from storage");
    }
    return {
      stream: this.storage.createReadStreamForKey(document.storageKey),
      mimeType: document.mimeType,
      filename: document.originalFilename,
      sizeBytes: Number(document.sizeBytes),
    };
  }

  async findScoped(documentId: string, dietitianAccountId: string, clientId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, dietitianAccountId, clientId },
    });
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    return document;
  }

  assertReadable(document: Document, portal: boolean) {
    if (document.status === "ARCHIVED") {
      throw new NotFoundException("Document not found");
    }
    if (portal && document.visibility !== "SHARED") {
      throw new NotFoundException("Document not found");
    }
  }

  async recordDownloadDenied(userId: string | undefined, dietitianAccountId: string, documentId: string) {
    await this.security.record({
      type: "document_download_denied",
      outcome: "failure",
      userId,
      dietitianAccountId,
      targetType: "document",
      targetId: documentId,
    });
  }

  private async onShared(document: Document, actorUserId: string) {
    const clientUserId = await this.recipients.clientPortalUserId(document.clientId);
    if (clientUserId && clientUserId !== actorUserId) {
      await this.notifications.create({
        dietitianAccountId: document.dietitianAccountId,
        userId: clientUserId,
        clientId: document.clientId,
        type: "DOCUMENT_SHARED",
        title: "Document shared with you",
        body: document.filename,
        targetType: "document",
        targetId: document.id,
      });
    }
  }

  private async notifyStaffDocumentUploaded(document: Document, actorUserId: string) {
    const dietitianAccountId = document.dietitianAccountId;
    if (!dietitianAccountId) return;
    const userIds = await this.recipients.assignedMemberUserIds(dietitianAccountId, document.clientId);
    await Promise.all(
      userIds
        .filter((id) => id !== actorUserId)
        .map((userId) =>
          this.notifications.create({
            dietitianAccountId,
            userId,
            clientId: document.clientId,
            type: "DOCUMENT_UPLOADED",
            title: "Client uploaded a document",
            body: document.filename,
            targetType: "document",
            targetId: document.id,
          }),
        ),
    );
  }

  toResponse(row: Document) {
    return {
      id: row.id,
      clientId: row.clientId,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: Number(row.sizeBytes),
      visibility: row.visibility,
      status: row.status,
      uploadedByUserId: row.uploadedByUserId,
      sharedAt: row.sharedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
