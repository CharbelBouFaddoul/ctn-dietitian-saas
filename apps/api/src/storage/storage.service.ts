import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private rootPath = "";

  async onModuleInit(): Promise<void> {
    const configured = process.env.FILE_STORAGE_PATH;
    if (!configured) {
      throw new Error("FILE_STORAGE_PATH is required");
    }

    this.rootPath = path.resolve(configured);
    await mkdir(this.rootPath, { recursive: true });
    await mkdir(this.documentsRoot(), { recursive: true });
    await mkdir(this.tempRoot(), { recursive: true });
    this.logger.log(`Storage root: ${this.rootPath}`);
  }

  getRootPath(): string {
    return this.rootPath;
  }

  documentsRoot(): string {
    return path.join(this.rootPath, "documents");
  }

  tempRoot(): string {
    return path.join(this.rootPath, "temporary");
  }

  buildDocumentKey(dietitianAccountId: string, clientId: string, documentId: string, extension: string): string {
    const safeExt = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
    return path.posix.join(
      "dietitians",
      dietitianAccountId,
      "clients",
      clientId,
      `${documentId}.${safeExt}`,
    );
  }

  buildTempKey(sessionId: string): string {
    const safe = sessionId.replace(/[^a-zA-Z0-9-]/g, "");
    return path.posix.join("temporary", `${safe}.part`);
  }

  resolveAbsolutePath(relativeKey: string): string {
    this.assertSafeKey(relativeKey);
    const absolute = path.resolve(this.rootPath, relativeKey);
    if (!absolute.startsWith(this.rootPath + path.sep) && absolute !== this.rootPath) {
      throw new Error("Storage path escapes root");
    }
    return absolute;
  }

  async writeStreamToKey(relativeKey: string, source: Readable): Promise<void> {
    this.assertSafeKey(relativeKey);
    const absolute = this.resolveAbsolutePath(relativeKey);
    await mkdir(path.dirname(absolute), { recursive: true });
    await pipeline(source, createWriteStream(absolute));
  }

  createReadStreamForKey(relativeKey: string): Readable {
    const absolute = this.resolveAbsolutePath(relativeKey);
    return createReadStream(absolute);
  }

  async moveKey(fromKey: string, toKey: string): Promise<void> {
    this.assertSafeKey(fromKey);
    this.assertSafeKey(toKey);
    const from = this.resolveAbsolutePath(fromKey);
    const to = this.resolveAbsolutePath(toKey);
    await mkdir(path.dirname(to), { recursive: true });
    await rename(from, to);
  }

  async deleteKey(relativeKey: string): Promise<void> {
    this.assertSafeKey(relativeKey);
    const absolute = this.resolveAbsolutePath(relativeKey);
    await unlink(absolute).catch(() => undefined);
  }

  async exists(relativeKey: string): Promise<boolean> {
    try {
      await access(this.resolveAbsolutePath(relativeKey));
      return true;
    } catch {
      return false;
    }
  }

  async ping(): Promise<boolean> {
    const probe = path.join(this.rootPath, ".health");
    await writeFile(probe, "ok", "utf8");
    await access(probe);
    await unlink(probe);
    return true;
  }

  private assertSafeKey(relativeKey: string): void {
    if (!relativeKey || relativeKey.startsWith("/") || relativeKey.includes("..")) {
      throw new Error("Invalid storage key");
    }
  }
}
