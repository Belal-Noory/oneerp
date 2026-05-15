import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { RequestIdInterceptor } from "./shared/request-id.interceptor";
import { ApiExceptionFilter } from "./shared/api-exception.filter";

async function bootstrap() {
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 
    "http://localhost:3000,http://localhost:3001,http://localhost:3002")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);

      const normalized = origin.trim();

      let hostname: string | null = null;
      try {
        hostname = new URL(normalized).hostname.toLowerCase();
      } catch {
        hostname = null;
      }

      const isLocalhost =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        normalized.startsWith("http://localhost:") ||
        normalized.startsWith("http://127.0.0.1:");

      const isOneErpOnline = hostname === "oneerp.online" || hostname?.endsWith(".oneerp.online") === true;

      if (isLocalhost || isOneErpOnline) return callback(null, true);
      if (allowedOrigins.includes(normalized)) return callback(null, true);

      return callback(null, false);
    },
    credentials: true
  });
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
