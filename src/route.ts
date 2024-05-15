import type { JetRequest, JetResponse, RequestParams } from ".";

type RouteNextHandler = () => void;
type RouteHandler<Params extends RequestParams = {}> = (
  req: JetRequest<Params>,
  res: JetResponse,
  next: RouteNextHandler
) => void;
export type RouteDefiner = {
  <P extends string | undefined>(
    pathPattern: P,
    handler: Route | RouteHandler<RouteParameters<P extends string ? P : "">>
  ): void;
  (handler: Route | RouteHandler): void;
};

interface ParamsDictionary {
  [key: string]: string;
}
type RemoveTail<
  S extends string,
  Tail extends string
> = S extends `${infer P}${Tail}` ? P : S;
type GetRouteParameter<S extends string> = RemoveTail<
  RemoveTail<RemoveTail<S, `/${string}`>, `-${string}`>,
  `.${string}`
>;
type RouteParameters<Route extends string> = string extends Route
  ? ParamsDictionary
  : Route extends `${string}(${string}`
  ? ParamsDictionary //TODO: handling for regex parameters
  : Route extends `${string}:${infer Rest}`
  ? (GetRouteParameter<Rest> extends never
      ? ParamsDictionary
      : GetRouteParameter<Rest> extends `${infer ParamName}?`
      ? { [P in ParamName]?: string }
      : { [P in GetRouteParameter<Rest>]: string }) &
      (Rest extends `${GetRouteParameter<Rest>}${infer Next}`
        ? RouteParameters<Next>
        : unknown)
  : {};

const isString = (s: any): s is string => typeof s === "string";

const isRouteBaseOrRouteHandler = (
  pattern: any
): pattern is RouteHandler | RouteBase =>
  typeof pattern === "function" || pattern instanceof RouteBase;

const testRoute = (
  routeMethod?: string,
  routePattern: string = "",
  method: string = "",
  url?: string,
  isRouter = false
) => {
  const params: RequestParams = {};
  const allowMethod = !routeMethod || routeMethod === method;
  if (!allowMethod) return { isMatch: false, params };
  if (routePattern) {
    const isParamsPattern = routePattern.includes(":");
    if (isParamsPattern) {
      if (!url) return { isMatch: false, params };
      const routeParts = routePattern.split("/");
      const urlParts = url.split("/");
      if (!isRouter && routeParts.length !== urlParts.length)
        return { isMatch: false, params };
      for (let i = 0; i < routeParts.length; i++) {
        const routePart = routeParts[i];
        if (routePart.startsWith(":")) {
          const paramName = routePart.substring(1);
          params[paramName] = urlParts[i];
        } else if (urlParts[i] !== routePart)
          return { isMatch: false, params: {} };
      }
      return { isMatch: true, params };
    }
    const patternMatched = url
      ? isRouter
        ? url.startsWith(routePattern)
        : url === routePattern
      : true;
    return { isMatch: patternMatched, params };
  }
  return { isMatch: true, params };
};

class RouteBase {
  readonly method?: string;
  readonly pattern?: string;
  readonly handler?: RouteHandler | RouteBase;

  constructor(
    method?: string,
    pattern?: string,
    handler?: RouteHandler | RouteBase
  ) {
    this.method = method;
    this.pattern = pattern;
    this.handler = handler;
  }

  handle(
    req: JetRequest,
    res: JetResponse,
    next: RouteNextHandler,
    root?: string
  ): void {
    const handler = this.handler;
    if (!handler) return next();
    if (handler instanceof RouteBase)
      return handler.handle(req, res, next, root);
    return handler(req, res, next);
  }
}

export default class Route extends RouteBase {
  private readonly stack: RouteBase[] = [];

  use: RouteDefiner;
  get: RouteDefiner;
  post: RouteDefiner;
  put: RouteDefiner;
  delete: RouteDefiner;
  head: RouteDefiner;
  options: RouteDefiner;
  connect: RouteDefiner;
  trace: RouteDefiner;
  patch: RouteDefiner;

  constructor() {
    super();
    type A = string | B;
    type B = RouteHandler | RouteBase;
    this.use = (arg1: A, arg2?: B) => this.addHandler(void 0, arg1, arg2);
    this.get = (arg1: A, arg2?: B) => this.addHandler("GET", arg1, arg2);
    this.post = (arg1: A, arg2?: B) => this.addHandler("POST", arg1, arg2);
    this.put = (arg1: A, arg2?: B) => this.addHandler("PUT", arg1, arg2);
    this.delete = (arg1: A, arg2?: B) => this.addHandler("DELETE", arg1, arg2);
    this.head = (arg1: A, arg2?: B) => this.addHandler("HEAD", arg1, arg2);
    this.trace = (arg1: A, arg2?: B) => this.addHandler("TRACE", arg1, arg2);
    this.options = (arg1: A, arg2?: B) =>
      this.addHandler("OPTIONS", arg1, arg2);
    this.patch = (arg1: A, arg2?: B) => this.addHandler("PATCH", arg1, arg2);
    this.connect = (arg1: A, arg2?: B) =>
      this.addHandler("CONNECT", arg1, arg2);
  }

  async handle(
    req: JetRequest,
    res: JetResponse,
    next: RouteNextHandler,
    _root: string = ""
  ) {
    const { stack } = this;
    const { method, url } = req;
    const root = _root + (this.pattern || "");
    if (stack.length === 0) return next();
    for (const handler of stack) {
      const currRoot = root + handler.pattern || "";
      const { isMatch, params } = testRoute(
        handler.method,
        currRoot,
        method,
        url,
        handler.handler instanceof Route
      );
      if (isMatch) {
        try {
          await new Promise<void>((resolve, reject) => {
            req.params = params;
            handler.handle(req, res, resolve, currRoot);
            req.onend(reject);
          });
        } catch {
          return;
        }
      }
    }
    return next();
  }

  private addHandler(
    arg1?: string, // expect method
    arg2?: string | RouteHandler | RouteBase, // expect path pattern
    arg3?: RouteHandler | RouteBase // expect route handler
  ) {
    const method = [arg1, arg2].every(isString) ? arg1 : void 0;
    const pattern = [arg2, arg1].find(isString) || "";
    const handler = [arg3, arg3].find(isRouteBaseOrRouteHandler);
    if (handler) this.stack.push(new RouteBase(method, pattern, handler));
    return this;
  }
}
