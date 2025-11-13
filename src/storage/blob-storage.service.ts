import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { del, head, list, put } from '@vercel/blob';

type BlobAccess = 'public'; // v2 SDK supports only 'public' for access

export type BlobUploadBody = Parameters<typeof put>[1];

export interface UploadedBlob {
  // Minimal common shape you can rely on from SDK calls
  pathname: string;
  url: string;
  downloadUrl: string;
  contentType: string;
  // Derived or looked up fields are optional
  size?: number;
  uploadedAt?: string; // ISO string for consistency in your app
}

export interface UploadBlobOptions {
  access?: BlobAccess; // only 'public' is valid in v2
  contentType?: string;
  addUniqueSuffix?: boolean;
  allowOverwrite?: boolean;
  cacheControlMaxAge?: number;
}

@Injectable()
export class BlobStorageService {
  private readonly logger = new Logger(BlobStorageService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Upload a blob using the official SDK.
   * Note: The SDK prevents overwrites unless allowOverwrite=true.
   */
  async uploadObject(
    pathname: string,
    body: BlobUploadBody,
    options?: UploadBlobOptions,
  ): Promise<UploadedBlob> {
    const token = this.getToken();
    const normalizedPath = this.normalizePath(pathname, options);

    try {
      const blob = await put(normalizedPath, body, {
        access: options?.access ?? 'public',
        contentType: options?.contentType,
        addRandomSuffix: false, // we handle suffix below if requested
        allowOverwrite: options?.allowOverwrite ?? false,
        cacheControlMaxAge: options?.cacheControlMaxAge,
        token,
      });

      // Optional enrichment: fetch size and uploadedAt with head()
      let size: number | undefined;
      let uploadedAtISO: string | undefined;
      try {
        const meta = await head(blob.url, { token });
        size = meta.size;
        uploadedAtISO = this.toIsoString(meta.uploadedAt);
      } catch (error) {
        const message = this.pickString(
          (error as { message?: unknown })?.message,
        );
        // head() is best-effort; keep going if it fails
        this.logger.warn(
          `Blob head() failed for ${blob.pathname}: ${message ?? String(error)}`,
        );
      }

      return {
        pathname: blob.pathname,
        url: blob.url,
        downloadUrl:
          this.pickString(this.ensureRecord(blob)?.downloadUrl) ?? blob.url,
        contentType:
          this.pickString(this.ensureRecord(blob)?.contentType) ??
          options?.contentType ??
          'application/octet-stream',
        size,
        uploadedAt: uploadedAtISO,
      };
    } catch (error: unknown) {
      const message = this.pickString(
        (error as { message?: unknown })?.message,
      );
      const fallback = message ?? String(error);
      this.logger.error(`Blob upload failed: ${fallback}`);
      throw new InternalServerErrorException(`Blob upload failed: ${fallback}`);
    }
  }

  /**
   * Lookup by exact pathname using list(prefix) and filtering.
   */
  async getObjectByPath(pathname: string): Promise<UploadedBlob | null> {
    const token = this.getToken();
    const normalizedPath = this.normalizePath(pathname);

    try {
      const { blobs } = await list({
        prefix: normalizedPath,
        limit: 100,
        token,
      });
      const match = blobs.find((b) => b.pathname === normalizedPath);
      if (!match) return null;

      return {
        pathname: match.pathname,
        url: match.url,
        downloadUrl: match.downloadUrl,
        contentType: 'application/octet-stream', // list() does not include contentType; fetch with head() if needed
        size: match.size,
        uploadedAt: this.toIsoString(match.uploadedAt),
      };
    } catch (error: unknown) {
      const message = this.pickString(
        (error as { message?: unknown })?.message,
      );
      const fallback = message ?? String(error);
      this.logger.error(`Blob lookup failed: ${fallback}`);
      throw new InternalServerErrorException(`Blob lookup failed: ${fallback}`);
    }
  }

  /**
   * Delete a blob by pathname or URL.
   */
  async deleteObject(urlOrPathname: string | string[]): Promise<void> {
    const token = this.getToken();
    try {
      await del(urlOrPathname, { token });
    } catch (error: unknown) {
      const message = this.pickString(
        (error as { message?: unknown })?.message,
      );
      const fallback = message ?? String(error);
      this.logger.error(`Blob delete failed: ${fallback}`);
      throw new InternalServerErrorException(`Blob delete failed: ${fallback}`);
    }
  }

  // ---- helpers ----

  private normalizePath(pathname: string, options?: UploadBlobOptions): string {
    const trimmed = pathname.replace(/^\/+/, '').trim();
    if (!trimmed) {
      throw new InternalServerErrorException('Blob pathname cannot be empty.');
    }

    if (options?.addUniqueSuffix) {
      const m = trimmed.match(/\.([^.]+)$/);
      const suffix = randomUUID();
      if (m) return `${trimmed.slice(0, -m[0].length)}-${suffix}.${m[1]}`;
      return `${trimmed}-${suffix}`;
    }

    return trimmed;
  }

  private getToken(): string {
    const token = this.configService
      .get<string>('BLOB_READ_WRITE_TOKEN')
      ?.trim();
    if (!token) {
      this.logger.error('BLOB_READ_WRITE_TOKEN is not configured.');
      throw new InternalServerErrorException(
        'Le stockage Blob n’est pas configuré (variable BLOB_READ_WRITE_TOKEN manquante).',
      );
    }
    return token;
  }

  private ensureRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private pickString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private toIsoString(value: unknown): string | undefined {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
    }
    return undefined;
  }
}
