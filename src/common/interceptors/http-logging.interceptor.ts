import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuthenticatedUserPayload, RequestWithUser } from '../types/request-with-user';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const method = req.method;
    const url = req.url;
    const startedAt = Date.now();
    const identity = this.describeUser(req.user);

    this.logger.log(`HTTP ${method} ${url} initiated ${identity}`);

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startedAt;
          this.logger.log(`HTTP ${method} ${url} completed in ${duration}ms ${identity}`);
        },
        error: (error: unknown) => {
          const duration = Date.now() - startedAt;
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `HTTP ${method} ${url} failed in ${duration}ms ${identity}: ${message}`,
          );
        },
      }),
    );
  }

  private describeUser(user: AuthenticatedUserPayload | undefined) {
    if (!user) {
      return '(anonymous)';
    }
    const id = user?.userId ?? user?.sub ?? 'unknown';
    const email = user?.email ? ` email=${user.email}` : '';
    return `(userId=${id}${email})`;
  }
}
