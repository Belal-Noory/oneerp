import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { ServerOptions } from "socket.io";

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

export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly allowedOrigins: string[]
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const cors: ServerOptions["cors"] = {
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin) return callback(null, true);
        return callback(null, isAllowedOrigin(origin, this.allowedOrigins));
      },
      credentials: true
    };

    return super.createIOServer(port, {
      ...options,
      path: "/api/socket.io",
      cors,
      transports: ["websocket", "polling"]
    });
  }
}
