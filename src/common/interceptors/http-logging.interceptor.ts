import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request & { user?: any }>();
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
        error: (error) => {
          const duration = Date.now() - startedAt;
          this.logger.error(
            `HTTP ${method} ${url} failed in ${duration}ms ${identity}: ${error?.message ?? error}`,
          );
        },
      }),
    );
  }

  private describeUser(user: any) {
    if (!user) {
      return '(anonymous)';
    }
    const id = user?.userId ?? user?.sub ?? 'unknown';
    const email = user?.email ? ` email=${user.email}` : '';
    return `(userId=${id}${email})`;
  }
}
