import { statSync, existsSync } from "fs";
import { resolve, relative, join } from "path";
import send from "send";

import type {
  JetRequest,
  JetResponse,
  JetWSServer,
  JetSocket,
  Duplex,
} from "./http.js";

export type RouteNextHandler = () => void;
export type RouteHandler<Params extends ParamsDictionary = {}> = (
  req: JetRequest<Params>,
  res: JetResponse,
  next: RouteNextHandler
) => void;
export type WSRouteHandler<Params extends ParamsDictionary = {}> = (
  soc: JetSocket,
  req: JetRequest<Params>,
  head: Buffer
) => void;
type RouteRemover = () => void;
export type RouteDefiner = {
  <P extends string | undefined>(
    pathPattern: P,
    handler: RouteHandler<RouteParameters<P extends string ? P : "">>
  ): RouteRemover;
  <P extends string | undefined>(
    pathPattern: P,
    handler: RouteBase
  ): RouteRemover;
  (handler: RouteHandler): RouteRemover;
  (handler: RouteBase): RouteRemover;
};
export type WSRouteDefiner = {
  <P extends string | undefined>(
    pathPattern: P,
    handler: WSRouteHandler<RouteParameters<P extends string ? P : "">>
  ): RouteRemover;
  <P extends string | undefined>(
    pathPattern: P,
    handler: WSRouteBase
  ): RouteRemover;
  (handler: WSRouteHandler): RouteRemover;
  (handler: WSRouteBase): RouteRemover;
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

const isWSRouteBaseOrWSRouteHandler = (
  pattern: any
): pattern is WSRouteHandler | WSRouteBase =>
  typeof pattern === "function" || pattern instanceof WSRouteBase;

const matchRoute = (
  routeMethod?: string,
  routePattern: string = "",
  method: string = "",
  url?: string,
  matchStart = false
): { isMatch: boolean; params?: ParamsDictionary } => {
  if (!(!routeMethod || routeMethod === method)) return { isMatch: false };
  if (!routePattern) return { isMatch: true };
  if (!routePattern.includes(":"))
    return {
      isMatch: url
        ? matchStart
          ? url.startsWith(routePattern)
          : url === routePattern
        : true,
    };
  if (!url) return { isMatch: false };
  const routeParts = routePattern.split("/");
  const urlParts = url.split("/");
  const partLength = routeParts.length;
  if (!matchStart && partLength !== urlParts.length) return { isMatch: false };
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
};

export class RouteBase {
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
    root?: string,
    currentPattern?: string
  ): void {
    const handler = this.handler;
    if (!handler) return next();
    if (handler instanceof RouteBase)
      return handler.handle(req, res, next, root, currentPattern);
    return handler(req, res, next);
  }
}

export class WSRouteBase {
  readonly pattern?: string;
  readonly handler?: WSRouteHandler | WSRouteBase;

  constructor(pattern?: string, handler?: WSRouteHandler | WSRouteBase) {
    this.pattern = pattern;
    this.handler = handler;
  }

  handleSocket(
    wss: JetWSServer,
    soc: Duplex,
    req: JetRequest,
    head: Buffer,
    next: RouteNextHandler,
    root?: string,
    currentPattern?: string
  ): void {
    const handler = this.handler;
    if (!handler) return next();
    if (handler instanceof WSRouteBase)
      return handler.handleSocket(
        wss,
        soc,
        req,
        head,
        next,
        root,
        currentPattern
      );
    wss.handleUpgrade(req, soc, head, (ws) => {
      wss.emit("connection", ws, req, head);
      handler(ws, req, head);
    });
  }
}

export type ServeStaticOptions = Partial<{
  index: string | string[];
}>;

export class StaticRouter extends RouteBase {
  index: string[];
  root: string;

  constructor(
    root: string,
    options: ServeStaticOptions = {},
    handler?: RouteHandler
  ) {
    super(void 0, void 0, handler);
    const { index } = options;
    this.index = index ? (Array.isArray(index) ? index : [index]) : [];
    this.root = resolve(root);
  }

  handle(
    req: JetRequest,
    res: JetResponse,
    next: RouteNextHandler,
    root: string = "",
    currentPattern: string = ""
  ) {
    try {
      const pathaname = req._url.pathname;
      const filepath = relative(currentPattern, pathaname);
      const absFilepath = join(this.root, filepath);
      if (existsSync(absFilepath)) {
        const stat = statSync(absFilepath);
        if (stat.isFile()) return send(req, absFilepath).pipe(res);
        const { index } = this;
        if (stat.isDirectory() && index.length) {
          for (const filename of index) {
            const indexFilepath = join(absFilepath, filename);
            const stat = statSync(indexFilepath);
            if (stat.isFile())
              return pathaname.endsWith("/")
                ? send(req, indexFilepath).pipe(res)
                : res.redirect(`${pathaname}/`);
          }
        }
      }
    } catch (e) {
      console.error(e);
      return res.status(500).end();
    }
    return super.handle(req, res, next, root, currentPattern);
  }
}

export default class Router extends RouteBase {
  private readonly stack: RouteBase[] = [];
  private readonly wsStack: WSRouteBase[] = [];

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
  ws: WSRouteDefiner;

  static(root: string, options?: ServeStaticOptions): RouteRemover;
  static(
    patern: string | undefined,
    root: string,
    options?: ServeStaticOptions
  ): RouteRemover;
  static(
    arg1?: string,
    arg2?: string | ServeStaticOptions,
    arg3?: ServeStaticOptions
  ) {
    const hasPattern = isString(arg2);
    const pattern = hasPattern ? arg1 : void 0;
    const root = hasPattern ? arg2 : arg1;
    const options = hasPattern ? arg3 : arg2;
    return this.use(pattern, new StaticRouter(root!, options));
  }

  constructor(handler?: RouteHandler) {
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
    type A2 = string | B2;
    type B2 = WSRouteHandler | WSRouteBase;
    this.ws = (a: A2, b?: B2) => {
      const pattern = isString(a) ? a : "";
      const handler = [a, b].find(isWSRouteBaseOrWSRouteHandler);
      const rb = new WSRouteBase(pattern, handler);
      const stack = this.wsStack;
      stack.push(rb);
      return () => {
        if (stack.includes(rb)) stack.splice(stack.indexOf(rb), 1);
      };
    };
    if (handler) this.use(handler);
  }

  async handle(
    req: JetRequest,
    res: JetResponse,
    next: RouteNextHandler,
    _root: string = "",
    _currentPattern: string = ""
  ) {
    const stack = this.stack;
    const { method, _url } = req;
    const root = `${_currentPattern}${this.pattern || ""}`;
    if (stack.length === 0) return next();
    for (const handler of stack) {
      const currPattern = `${root}${handler.pattern || ""}`;
      const { isMatch, params } = matchRoute(
        handler.method,
        currPattern,
        method,
        decodeURIComponent(_url.pathname),
        handler.handler instanceof RouteBase || !handler.pattern
      );
      if (isMatch) {
        try {
          await new Promise<void>((resolve, reject) => {
            req.params = params || {};
            handler.handle(req, res, resolve, root, currPattern);
            res.once("close", reject);
          });
        } catch {
          return;
        }
      }
    }
    return next();
  }

  async handleSocket(
    wss: JetWSServer,
    soc: Duplex,
    req: JetRequest,
    head: Buffer,
    next: RouteNextHandler,
    _root: string = "",
    _currentPattern: string = ""
  ) {
    const stack = this.wsStack;
    const { _url } = req;
    const root = `${_currentPattern}${this.pattern || ""}`;
    if (stack.length === 0) return next();
    for (const handler of stack) {
      const currPattern = `${root}${handler.pattern || ""}`;
      const { isMatch, params } = matchRoute(
        undefined,
        currPattern,
        undefined,
        decodeURIComponent(_url.pathname),
        handler.handler instanceof WSRouteBase || !handler.pattern
      );
      if (isMatch) {
        try {
          await new Promise<void>((resolve, reject) => {
            req.params = params || {};
            handler.handleSocket(
              wss,
              soc,
              req,
              head,
              resolve,
              root,
              currPattern
            );
            soc.once("end", reject);
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
    const handler = [arg3, arg2, arg1].find(isRouteBaseOrRouteHandler);
    const rb = new RouteBase(method, pattern, handler);
    const stack = this.stack;
    stack.push(rb);
    return () => {
      if (stack.includes(rb)) stack.splice(stack.indexOf(rb), 1);
    };
  }
}
