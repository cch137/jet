import type { JetRequest, JetResponse } from "./http.js";

type CORSOptions = {
  credentials?: true;
  origin?: string;
  methods?: string[];
  headers?: string[];
};

const trimOrigin = (s: string) => {
  const u = new URL(s);
  return u.origin;
};

export default function cors({
  credentials = true,
  origin = "*",
  methods,
  headers,
}: CORSOptions = {}) {
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
}
