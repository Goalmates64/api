import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new HttpLoggingInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = process.env.APP_PORT || 3000;
  await app.listen(port);
}
bootstrap();
