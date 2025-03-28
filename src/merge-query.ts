import type { ParsedQs } from "qs";
import type { JetRouteHandler } from "./route.js";

type ParsedQsValue = string | ParsedQs | (string | ParsedQs)[] | undefined;

const tryParseQsToJSON = (q: ParsedQsValue): any => {
  if (!q) return q;
  if (typeof q === "string") {
    try {
      return JSON.parse(q);
    } catch {
      return q;
    }
  }
  if (Array.isArray(q)) return q.map((i) => tryParseQsToJSON(i));
  for (const k in q) q[k] = tryParseQsToJSON(q[k]);
  return q;
};

export const mergeQuery = ({
  overwrite = false,
  parseJSON = true,
}: Partial<{
  overwrite: boolean;
  parseJSON: boolean;
}> = {}): JetRouteHandler => {
  return async (req, _, next) => {
    const body = { ...Object(req.body) };
    req.jetURL.searchParams.forEach((value, key) => {
      if (!(key in body) || overwrite) {
        body[key] = parseJSON ? tryParseQsToJSON(value) : value;
      }
    });
    req.body = body;
    return await next();
  };
};
