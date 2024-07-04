import { statSync, existsSync } from "fs";
import { resolve, relative, join } from "path";
import send from "send";

import type { JetRequest, JetResponse } from "./http.js";
import type { JetWSServer, JetSocket, Duplex } from "./ws.js";

export type HTTPMethod =
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "TRACE"
  | "CONNECT";

export type WSMethod = "WS";

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

export type WSRoutePredicate<Params extends ParamsDictionary = {}> = (
  soc: Duplex,
  req: JetRequest<Params>,
  head: Buffer
) => boolean;

export type RouteDefiner = {
  <P extends string | undefined>(
    pathPattern: P,
    handler: RouteHandler<RouteParameters<P extends string ? P : "">>
  ): RouteBase;
  <P extends string | undefined>(pathPattern: P, handler: RouteBase): RouteBase;
  (handler: RouteHandler): RouteBase;
  (handler: RouteBase): RouteBase;
};

export type WSRouteDefiner = {
  <P extends string | undefined>(
    pathPattern: P,
    handler: WSRouteHandler<RouteParameters<P extends string ? P : "">>,
    predicate?: WSRoutePredicate<RouteParameters<P extends string ? P : "">>
  ): WSRouteBase;
  <P extends string | undefined>(
    pathPattern: P,
    handler: WSRouteBase,
    predicate?: WSRoutePredicate<RouteParameters<P extends string ? P : "">>
  ): WSRouteBase;
  (handler: WSRouteHandler, predicate?: WSRoutePredicate): WSRouteBase;
  (handler: WSRouteBase, predicate?: WSRoutePredicate): WSRouteBase;
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

const HANDLED = Symbol("handled");

const isString = (s: any): s is string => typeof s === "string";

const isFunction = (f: any): f is Function => typeof f === "function";

const isHttpRoutable = (pattern: any): pattern is RouteHandler | RouteBase =>
  isFunction(pattern) || pattern instanceof RouteBase;

const isWSRoutable = (pattern: any): pattern is WSRouteHandler | WSRouteBase =>
  isFunction(pattern) || pattern instanceof WSRouteBase;

const isWSPreHandler = (pattern: any): pattern is WSRoutePredicate =>
  isFunction(pattern);

const matchRoute = (
  routeMethod?: string,
  routePattern: string = "",
  method: string = "",
  url?: string,
  matchStart = false
): { isMatch: boolean; params?: ParamsDictionary } => {
  routePattern = routePattern.replace(/(\/|\\)+/, "/");
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
  readonly method?: HTTPMethod;
  readonly pattern?: string;
  readonly handler?: RouteHandler | RouteBase | Router;

  constructor(
    method?: HTTPMethod,
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
      handler.handle(req, res, next, root, currentPattern);
    else handler(req, res, next);
  }
}

export class WSRouteBase {
  readonly pattern?: string;
  readonly handler?: WSRouteHandler | WSRouteBase | Router;
  readonly predicate?: WSRoutePredicate;

  constructor(
    pattern?: string,
    handler?: WSRouteHandler | WSRouteBase,
    predicate?: WSRoutePredicate
  ) {
    this.pattern = pattern;
    this.handler = handler;
    this.predicate = predicate;
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
    if (handler instanceof WSRouteBase || handler instanceof Router) {
      handler.handleSocket(wss, soc, req, head, next, root, currentPattern);
      return;
    }
    if (this.predicate && !this.predicate(soc, req, head)) {
      soc.destroy();
      return;
    }
    wss.handleUpgrade(req, soc, head, (ws, req) => {
      ws.on("close", () => (ws as JetSocket).rooms.clear());
      wss.emit("connection", ws, req, head);
      soc.emit(HANDLED);
      handler(ws as JetSocket, req, head);
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

type HTTPRouteArg1 = string | HTTPRouteArg2;
type HTTPRouteArg2 = RouteHandler | RouteBase;
type WSRouteArg1 = string | WSRouteHandler | WSRouteBase;
type WSRouteArg2 = WSRouteHandler | WSRouteBase | WSRoutePredicate;
type WSRouteArg3 = WSRoutePredicate;

export default class Router extends RouteBase {
  readonly stack: (RouteBase | WSRouteBase)[] = [];

  constructor(handler?: RouteHandler) {
    super();
    if (handler) this.use(handler);
  }

  use: RouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler(void 0, a, b);
  get: RouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("GET", a, b);
  post: RouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("POST", a, b);
  put: RouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("PUT", a, b);
  delete: RouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("DELETE", a, b);
  head: RouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("HEAD", a, b);
  trace: RouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("TRACE", a, b);
  options: RouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("OPTIONS", a, b);
  patch: RouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("PATCH", a, b);
  connect: RouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("CONNECT", a, b);
  ws: WSRouteDefiner = (a: WSRouteArg1, b?: WSRouteArg2, c?: WSRouteArg3) =>
    this.addHandler("WS", a, b, c);

  static(root: string, options?: ServeStaticOptions): RouteBase;
  static(
    patern: string | undefined,
    root: string,
    options?: ServeStaticOptions
  ): RouteBase;
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

  async handle(
    req: JetRequest,
    res: JetResponse,
    next: RouteNextHandler,
    _root: string = "",
    _currentPattern: string = ""
  ) {
    const stack = this.stack;
    const { method, _url } = req;
    const root = `${_currentPattern}${this.pattern || ""}` || "/";
    if (stack.length === 0) return next();
    for (const handler of stack) {
      if (handler instanceof WSRouteBase) continue;
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
            res.once("close", reject);
            handler.handle(
              req,
              res,
              () => (resolve(), res.off("close", reject)),
              root,
              currPattern
            );
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
    const stack = this.stack;
    const { _url } = req;
    const root = `${_currentPattern}${this.pattern || ""}` || "/";
    if (stack.length === 0) return next();
    for (const handler of stack) {
      const isRouter = handler.handler instanceof Router;
      if (handler instanceof RouteBase && !isRouter) continue;
      const currPattern = `${root}${handler.pattern || ""}`;
      const { isMatch, params } = matchRoute(
        undefined,
        currPattern,
        undefined,
        decodeURIComponent(_url.pathname),
        isRouter || !handler.pattern
      );
      if (isMatch) {
        try {
          await new Promise<void>((resolve, reject) => {
            req.params = params || {};
            soc.once(HANDLED, reject);
            (isRouter
              ? handler.handler
              : (handler as WSRouteBase)
            ).handleSocket(wss, soc, req, head, resolve, root, currPattern);
          });
        } catch {
          return;
        }
      }
    }
    return next();
  }

  addHandler(
    arg1?: WSMethod | WSRouteHandler | WSRouteBase,
    arg2?: string | WSRouteHandler | WSRouteBase,
    arg3?: WSRouteHandler | WSRouteBase | WSRoutePredicate,
    arg4?: WSRoutePredicate
  ): WSRouteBase;
  addHandler(
    arg1?: HTTPMethod | RouteHandler | RouteBase,
    arg2?: string | RouteHandler | RouteBase,
    arg3?: RouteHandler | RouteBase
  ): RouteBase;
  addHandler(
    arg1?: string | RouteHandler | RouteBase,
    arg2?: string | RouteHandler | RouteBase,
    arg3?: RouteHandler | RouteBase
  ): RouteBase;
  addHandler(
    arg1?: string | RouteHandler | RouteBase | WSRouteHandler | WSRouteBase,
    arg2?: string | RouteHandler | RouteBase | WSRouteHandler | WSRouteBase,
    arg3?:
      | RouteHandler
      | RouteBase
      | WSRouteHandler
      | WSRouteBase
      | WSRoutePredicate,
    arg4?: WSRoutePredicate
  ) {
    const method =
      isString(arg2) && isString(arg1)
        ? (arg1 as HTTPMethod | WSMethod)
        : void 0;
    if (method === "WS") {
      const pattern = isString(arg2) ? arg2 : "";
      const handlers1 = [arg2, arg3];
      const handlers2 = [arg2, arg3, arg4];
      const handler = handlers1.find(isWSRoutable);
      const i = handlers1.indexOf(handler);
      const _predicate = handlers2[i + 1];
      const predicate =
        i !== -1 && isWSPreHandler(_predicate) ? _predicate : void 0;
      const rb = new WSRouteBase(pattern, handler, predicate);
      this.stack.push(rb);
      return rb;
    }
    const rb = new RouteBase(
      method,
      [arg2, arg1].find(isString) || "",
      [arg3, arg2, arg1].find(isHttpRoutable)
    );
    this.stack.push(rb);
    return rb;
  }

  removeHandler(routeBase: RouteBase | WSRouteBase) {
    const index = this.stack.indexOf(routeBase);
    if (index === -1) return false;
    this.stack.splice(index, 1);
    return true;
  }
}
