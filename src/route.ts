import type { JetRequest, JetResponse } from "./http";

type RouteNextHandler = () => void;
type RouteHandler<Params extends ParamsDictionary = {}> = (
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

export type ParamsDictionary = {
  [key: string]: string;
};
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
  ? ParamsDictionary
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

const matchRoute = (
  routeMethod?: string,
  routePattern: string = "",
  method: string = "",
  url?: string,
  isRouter = false
): { isMatch: boolean; params?: ParamsDictionary } => {
  const allowMethod = !routeMethod || routeMethod === method;
  if (!allowMethod) return { isMatch: false };
  if (routePattern) {
    const isParamsPattern = routePattern.includes(":");
    if (isParamsPattern) {
      if (!url) return { isMatch: false };
      const routeParts = routePattern.split("/");
      const urlParts = url.split("/");
      const partLength = routeParts.length;
      if (!isRouter && partLength !== urlParts.length)
        return { isMatch: false };
      const params: ParamsDictionary = {};
      for (let i = 0; i < partLength; i++) {
        const routePart = routeParts[i];
        const urlPart = urlParts[i];
        const isParamPart = routePart.startsWith(":");
        if (isParamPart) {
          const isOptional = routePart.endsWith("?");
          const paramName = routePart.substring(
            1,
            routePart.length - (isOptional ? 1 : 0)
          );
          if (!isOptional && !urlPart) return { isMatch: false };
          params[paramName] = urlPart;
        } else if (urlPart !== routePart) return { isMatch: false };
      }
      return { isMatch: true, params };
    }
    const patternMatched = url
      ? isRouter
        ? url.startsWith(routePattern)
        : url === routePattern
      : true;
    return { isMatch: patternMatched };
  }
  return { isMatch: true };
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
    this.use = (a: A, b?: B) => this.addHandler(void 0, a, b);
    this.get = (a: A, b?: B) => this.addHandler("GET", a, b);
    this.post = (a: A, b?: B) => this.addHandler("POST", a, b);
    this.put = (a: A, b?: B) => this.addHandler("PUT", a, b);
    this.delete = (a: A, b?: B) => this.addHandler("DELETE", a, b);
    this.head = (a: A, b?: B) => this.addHandler("HEAD", a, b);
    this.trace = (a: A, b?: B) => this.addHandler("TRACE", a, b);
    this.options = (a: A, b?: B) => this.addHandler("OPTIONS", a, b);
    this.patch = (a: A, b?: B) => this.addHandler("PATCH", a, b);
    this.connect = (a: A, b?: B) => this.addHandler("CONNECT", a, b);
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
      const currPattern = root + handler.pattern || "";
      const { isMatch, params } = matchRoute(
        handler.method,
        currPattern,
        method,
        url,
        handler.handler instanceof Route
      );
      if (isMatch) {
        try {
          await new Promise<void>((resolve, reject) => {
            req.params = params || {};
            handler.handle(req, res, resolve, currPattern);
            req.once("end", reject);
          });
        } catch {
          return;
        }
      }
    }
    return next();
  }

  private addHandler(
    arg1?: string | RouteHandler | RouteBase, // expect method
    arg2?: string | RouteHandler | RouteBase, // expect path pattern
    arg3?: RouteHandler | RouteBase // expect route handler
  ) {
    const method = isString(arg1) && isString(arg2) ? arg1 : void 0;
    const pattern = [arg2, arg1].find(isString) || "";
    const handler = [arg3, arg2].find(isRouteBaseOrRouteHandler);
    if (handler) this.stack.push(new RouteBase(method, pattern, handler));
    return this;
  }
}
