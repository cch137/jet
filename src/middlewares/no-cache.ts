import type { JetRouteHandler } from "../route.js";

export const noCache = (): JetRouteHandler => {
  return async (_, res, next) => {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, max-age=0"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
    return await next();
  };
};
