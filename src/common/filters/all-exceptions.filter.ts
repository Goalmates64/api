import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    this.logger.error(
      `Unhandled error on ${request.method} ${request.url}: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode: status,
            message: message,
          };

    response.status(status).json(body);
  }
}
