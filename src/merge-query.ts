import type { JetRouteHandler } from "./route.js";

export const mergeQuery = ({
  overwrite = true,
}: Partial<{
  overwrite: boolean;
}> = {}): JetRouteHandler => {
  return async (req, _, next) => {
    const { query } = req;
    const body: { [key: string]: unknown } = { ...Object(req.body) };
    if (overwrite) {
      for (const key in body) {
        query[key] = body[key];
      }
    } else {
      for (const key in body) {
        if (key in query) continue;
        query[key] = body[key];
      }
    }
    return await next();
  };
};
