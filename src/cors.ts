import type {
  JetCORSOptions,
  JetRequest,
  JetResponse,
  JetRouteHandler,
} from "./types.js";

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
    if (credentials) res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Origin",
      (origin === "*"
        ? trimOrigin(req.headers.referer ?? req.jetURL.origin)
        : origin) ?? "*"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      methods ? methods.join(", ") : "*"
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
