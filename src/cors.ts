import type { JetRequest, JetResponse } from "./http.js";
import type { JetRouteHandler } from "./route.js";

export type JetCORSOptions = {
  credentials?: true;
  origin?: string;
  methods?: string[];
  headers?: string[];
};

const trimOrigin = (s: string) => {
  const u = new URL(s);
  return u.origin;
};

export const cors = ({
  credentials = true,
  origin = "*",
  methods,
  headers,
}: JetCORSOptions = {}): JetRouteHandler => {
  return (req: JetRequest, res: JetResponse, next: () => void) => {
    if (credentials) {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader(
      "Access-Control-Allow-Origin",
      (origin === "*"
        ? trimOrigin(req.headers.referer ?? req.jetURL.origin)
        : origin) ?? "*"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      methods ? methods.join(", ") : "GET, POST, PUT, DELETE, PATCH, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      headers ? headers.join(", ") : "*"
    );
    if (req.method === "OPTIONS") {
      res.setHeader("Content-Length", "0");
      res.status(204).end();
    } else {
      next();
    }
  };
};
