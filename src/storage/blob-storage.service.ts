import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

const VERCEL_BLOB_API_BASE = 'https://api.vercel.com/v2/blobs';

type BlobAccess = 'public' | 'private';

type FetchBodyInit = globalThis.BodyInit;

export type BlobUploadBody = string | Buffer | Uint8Array | Readable | Blob;

export interface BlobObject {
  id: string;
  pathname: string;
  size: number;
  uploadedAt: string;
  url?: string;
  contentType?: string;
}

interface CreateBlobResponse {
  blob: BlobObject;
  uploadUrl: string;
}

interface BlobLookupResponse {
  blob: BlobObject;
  downloadUrl?: string;
}

export interface UploadBlobOptions {
  access?: BlobAccess;
  contentType?: string;
  addUniqueSuffix?: boolean;
}

@Injectable()
export class BlobStorageService {
  private readonly logger = new Logger(BlobStorageService.name);

  constructor(private readonly configService: ConfigService) {}

  async uploadObject(
    pathname: string,
    body: BlobUploadBody,
    options?: UploadBlobOptions,
  ): Promise<BlobObject> {
    const token = this.getToken();
    const normalizedPath = this.normalizePath(pathname, options);

    const { uploadUrl, blob } = await this.createUploadTarget(token, normalizedPath, options);
    await this.pushBytes(uploadUrl, body, options);

    return {
      ...blob,
      pathname: normalizedPath,
      contentType: options?.contentType ?? blob.contentType,
    };
  }

  async getObjectByPath(pathname: string): Promise<BlobLookupResponse | null> {
    const token = this.getToken();
    const normalizedPath = this.normalizePath(pathname);

    const response = await fetch(
      `${VERCEL_BLOB_API_BASE}/by-path?pathname=${encodeURIComponent(normalizedPath)}`,
      {
        headers: this.buildAuthHeaders(token),
      },
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new InternalServerErrorException(
        `Blob lookup failed (${response.status}): ${message}`,
      );
    }

    const payload = (await response.json()) as BlobLookupResponse;
    return payload;
  }

  private async createUploadTarget(
    token: string,
    pathname: string,
    options?: UploadBlobOptions,
  ): Promise<CreateBlobResponse> {
    const response = await fetch(VERCEL_BLOB_API_BASE, {
      method: 'POST',
      headers: {
        ...this.buildAuthHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access: options?.access ?? 'private',
        contentType: options?.contentType,
        pathname,
      }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new InternalServerErrorException(
        `Failed to create blob upload target (${response.status}): ${message}`,
      );
    }

    const payload = (await response.json()) as CreateBlobResponse;

    if (!payload.uploadUrl) {
      throw new InternalServerErrorException('Blob upload URL missing in response.');
    }

    return payload;
  }

  private async pushBytes(
    uploadUrl: string,
    body: BlobUploadBody,
    options?: UploadBlobOptions,
  ) {
    const headers: Record<string, string> = {};
    if (options?.contentType) {
      headers['Content-Type'] = options.contentType;
    }

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers,
      body: this.normalizeBody(body),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new InternalServerErrorException(
        `Blob upload failed (${response.status}): ${message}`,
      );
    }
  }

  private normalizeBody(body: BlobUploadBody): FetchBodyInit {
    if (typeof body === 'string') {
      return body;
    }

    if (body instanceof Readable) {
      return body as unknown as FetchBodyInit;
    }

    if (body instanceof Uint8Array || body instanceof Buffer) {
      return body as unknown as FetchBodyInit;
    }

    return body as FetchBodyInit;
  }

  private normalizePath(pathname: string, options?: UploadBlobOptions) {
    const trimmed = pathname.replace(/^\/+/, '').trim();
    if (!trimmed) {
      throw new InternalServerErrorException('Blob pathname cannot be empty.');
    }

    if (options?.addUniqueSuffix) {
      const extensionMatch = trimmed.match(/\.([^.]+)$/);
      const suffix = randomUUID();
      if (extensionMatch) {
        const base = trimmed.slice(0, -extensionMatch[0].length);
        return `${base}-${suffix}.${extensionMatch[1]}`;
      }
      return `${trimmed}-${suffix}`;
    }

    return trimmed;
  }

  private buildAuthHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  private getToken(): string {
    const token = this.configService.get<string>('BLOB_READ_WRITE_TOKEN');
    if (!token) {
      this.logger.error('BLOB_READ_WRITE_TOKEN is not configured.');
      throw new InternalServerErrorException(
        'Le stockage Blob n’est pas configuré (variable BLOB_READ_WRITE_TOKEN manquante).',
      );
    }
    return token;
  }
}
