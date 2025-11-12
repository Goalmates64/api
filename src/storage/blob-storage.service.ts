import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { del, head, list, put } from '@vercel/blob';

type BlobAccess = 'public'; // v2 SDK supports only 'public' for access

export type BlobUploadBody =
  | string
  | Buffer
  | Uint8Array
  | Blob
  | ReadableStream<any>;

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
      const blob = await put(normalizedPath, body as any, {
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
        uploadedAtISO = meta.uploadedAt.toISOString();
      } catch (e) {
        // head() is best-effort; keep going if it fails
        this.logger.warn(
          `Blob head() failed for ${blob.pathname}: ${String(e?.message ?? e)}`,
        );
      }

      return {
        pathname: blob.pathname,
        url: blob.url,
        downloadUrl: (blob as any).downloadUrl ?? blob.url, // SDK returns downloadUrl
        contentType:
          (blob as any).contentType ??
          options?.contentType ??
          'application/octet-stream',
        size,
        uploadedAt: uploadedAtISO,
      };
    } catch (err: any) {
      const message =
        typeof err?.message === 'string' ? err.message : String(err);
      this.logger.error(`Blob upload failed: ${message}`);
      throw new InternalServerErrorException(`Blob upload failed: ${message}`);
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
        uploadedAt: match.uploadedAt?.toISOString?.(),
      };
    } catch (err: any) {
      const message =
        typeof err?.message === 'string' ? err.message : String(err);
      this.logger.error(`Blob lookup failed: ${message}`);
      throw new InternalServerErrorException(`Blob lookup failed: ${message}`);
    }
  }

  /**
   * Delete a blob by pathname or URL.
   */
  async deleteObject(urlOrPathname: string | string[]): Promise<void> {
    const token = this.getToken();
    try {
      await del(urlOrPathname as any, { token });
    } catch (err: any) {
      const message =
        typeof err?.message === 'string' ? err.message : String(err);
      this.logger.error(`Blob delete failed: ${message}`);
      throw new InternalServerErrorException(`Blob delete failed: ${message}`);
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
}
