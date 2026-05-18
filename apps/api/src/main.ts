import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { RequestIdInterceptor } from "./shared/request-id.interceptor";
import { ApiExceptionFilter } from "./shared/api-exception.filter";
import { SocketIoAdapter } from "./shared/socket-io.adapter";

function isAllowedOrigin(origin: string, allowList: string[]): boolean {
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

  if (isLocalhost || isOneErpOnline) return true;
  return allowList.includes(normalized);
}

async function bootstrap() {
  const allowedOrigins = (process.env.CORS_ORIGINS ??
    "http://localhost:3000,http://localhost:3001,http://localhost:3002")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const app = await NestFactory.create(AppModule);

  app.use((req: { headers: Record<string, unknown>; method?: string }, res: { setHeader: (k: string, v: string) => void; statusCode?: number; end: () => void }, next: () => void) => {
    const origin = typeof req.headers?.origin === "string" ? (req.headers.origin as string) : null;
    if (origin && isAllowedOrigin(origin, allowedOrigins)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Tenant-Id,X-OneERP-Webhook-Secret");
    }
    if ((req.method ?? "").toUpperCase() === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    next();
  });

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      return callback(null, isAllowedOrigin(origin, allowedOrigins));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-Id", "X-OneERP-Webhook-Secret"]
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
  app.useWebSocketAdapter(new SocketIoAdapter(app, allowedOrigins));

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
