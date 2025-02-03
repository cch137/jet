import { statSync, existsSync } from "fs";
import { resolve, relative, join } from "path";
import send from "send";

import type { Duplex } from "./ws.js";
import type {
  JetRequest,
  JetResponse,
  JetRouteNextHandler,
  JetRouteHandler,
  JetWSRouteHandler,
  JetSocket,
  ParamsDictionary,
  HTTPMethod,
  WSMethod,
} from "./types.js";
import { JetWebSocketServer } from "./types.js";

export type JetWSRoutePredicate<Params extends ParamsDictionary = {}> = (
  soc: Duplex,
  req: JetRequest<Params>,
  head: Buffer
) => boolean | Promise<boolean>;

export type JetRouteDefiner = {
  <P extends string | undefined>(
    pathPattern: P,
    handler: JetRouteHandler<RouteParameters<P extends string ? P : "">>
  ): RouteBase;
  <P extends string | undefined>(pathPattern: P, handler: RouteBase): RouteBase;
  (handler: JetRouteHandler): RouteBase;
  (handler: RouteBase): RouteBase;
};

export type JetWSRouteDefiner = {
  <P extends string | undefined>(
    pathPattern: P,
    handler: JetWSRouteHandler<RouteParameters<P extends string ? P : "">>,
    predicate?: JetWSRoutePredicate<RouteParameters<P extends string ? P : "">>
  ): JetWSRouteBase;
  <P extends string | undefined>(
    pathPattern: P,
    handler: JetWSRouteBase,
    predicate?: JetWSRoutePredicate<RouteParameters<P extends string ? P : "">>
  ): JetWSRouteBase;
  (handler: JetWSRouteHandler, predicate?: JetWSRoutePredicate): JetWSRouteBase;
  (handler: JetWSRouteBase, predicate?: JetWSRoutePredicate): JetWSRouteBase;
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

const isHttpRoutable = (pattern: any): pattern is JetRouteHandler | RouteBase =>
  isFunction(pattern) || pattern instanceof RouteBase;

const isWSRoutable = (
  pattern: any
): pattern is JetWSRouteHandler | JetWSRouteBase =>
  isFunction(pattern) || pattern instanceof JetWSRouteBase;

const isWSPreHandler = (pattern: any): pattern is JetWSRoutePredicate =>
  isFunction(pattern);

const matchRoute = (
  routeMethod?: string,
  routePattern: string = "",
  method: string = "",
  url?: string,
  matchStart = false
): { isMatch: boolean; params?: ParamsDictionary } => {
  routePattern = routePattern.replace(/(\/|\\)+/g, "/");
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
  readonly handler?: JetRouteHandler | RouteBase | Router;

  constructor(
    method?: HTTPMethod,
    pattern?: string,
    handler?: JetRouteHandler | RouteBase
  ) {
    this.method = method;
    this.pattern = pattern;
    this.handler = handler;
  }

  handle(
    req: JetRequest,
    res: JetResponse,
    next: JetRouteNextHandler,
    root?: string,
    currentPattern?: string
  ): void {
    const handler = this.handler;
    if (!handler) next();
    else if (handler instanceof RouteBase)
      handler.handle(req, res, next, root, currentPattern);
    else handler(req, res, next);
  }
}

export class JetWSRouteBase {
  readonly pattern?: string;
  readonly handler?: JetWSRouteHandler | JetWSRouteBase | Router;
  readonly predicate?: JetWSRoutePredicate;

  constructor(
    pattern?: string,
    handler?: JetWSRouteHandler | JetWSRouteBase,
    predicate?: JetWSRoutePredicate
  ) {
    this.pattern = pattern;
    this.handler = handler;
    this.predicate = predicate;
  }

  async handleSocket(
    wss: JetWebSocketServer,
    soc: Duplex,
    req: JetRequest,
    head: Buffer,
    next: JetRouteNextHandler,
    root?: string,
    currentPattern?: string
  ) {
    const handler = this.handler;
    if (!handler) return next();
    if (handler instanceof JetWSRouteBase || handler instanceof Router) {
      handler.handleSocket(wss, soc, req, head, next, root, currentPattern);
      return;
    }
    if (this.predicate && !(await this.predicate(soc, req, head))) {
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
    handler?: JetRouteHandler
  ) {
    super(void 0, void 0, handler);
    const { index } = options;
    this.index = index ? (Array.isArray(index) ? index : [index]) : [];
    this.root = resolve(root);
  }

  handle(
    req: JetRequest,
    res: JetResponse,
    next: JetRouteNextHandler,
    root: string = "",
    currentPattern: string = ""
  ) {
    try {
      const pathaname = req.jetURL.pathname;
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
type HTTPRouteArg2 = JetRouteHandler | RouteBase;
type WSRouteArg1 = string | JetWSRouteHandler | JetWSRouteBase;
type WSRouteArg2 = JetWSRouteHandler | JetWSRouteBase | JetWSRoutePredicate;
type WSRouteArg3 = JetWSRoutePredicate;

export default class Router extends RouteBase {
  readonly stack: (RouteBase | JetWSRouteBase)[] = [];

  constructor(handler?: JetRouteHandler) {
    super();
    if (handler) this.use(handler);
  }

  use: JetRouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler(void 0, a, b);
  get: JetRouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("GET", a, b);
  post: JetRouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("POST", a, b);
  put: JetRouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("PUT", a, b);
  delete: JetRouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("DELETE", a, b);
  head: JetRouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("HEAD", a, b);
  trace: JetRouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("TRACE", a, b);
  options: JetRouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("OPTIONS", a, b);
  patch: JetRouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("PATCH", a, b);
  connect: JetRouteDefiner = (a: HTTPRouteArg1, b?: HTTPRouteArg2) =>
    this.addHandler("CONNECT", a, b);
  ws: JetWSRouteDefiner = (a: WSRouteArg1, b?: WSRouteArg2, c?: WSRouteArg3) =>
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
    next: JetRouteNextHandler,
    _root: string = "",
    _currentPattern: string = ""
  ) {
    const stack = this.stack;
    const { method, jetURL } = req;
    const root = `${_currentPattern}${this.pattern || ""}` || "/";
    if (stack.length === 0) return next();
    for (const handler of stack) {
      if (handler instanceof JetWSRouteBase) continue;
      const currPattern = `${root}${handler.pattern || ""}`;
      const { isMatch, params } = matchRoute(
        handler.method,
        currPattern,
        method,
        decodeURIComponent(jetURL.pathname),
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
              () => {
                resolve(), res.off("close", reject);
              },
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
    wss: JetWebSocketServer,
    soc: Duplex,
    req: JetRequest,
    head: Buffer,
    next: JetRouteNextHandler,
    _root: string = "",
    _currentPattern: string = ""
  ) {
    const stack = this.stack;
    const url = req.jetURL;
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
        decodeURIComponent(url.pathname),
        isRouter || !handler.pattern
      );
      if (isMatch) {
        try {
          await new Promise<void>((resolve, reject) => {
            req.params = params || {};
            soc.once(HANDLED, reject);
            (isRouter
              ? handler.handler
              : (handler as JetWSRouteBase)
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
    arg1?: WSMethod | JetWSRouteHandler | JetWSRouteBase,
    arg2?: string | JetWSRouteHandler | JetWSRouteBase,
    arg3?: JetWSRouteHandler | JetWSRouteBase | JetWSRoutePredicate,
    arg4?: JetWSRoutePredicate
  ): JetWSRouteBase;
  addHandler(
    arg1?: HTTPMethod | JetRouteHandler | RouteBase,
    arg2?: string | JetRouteHandler | RouteBase,
    arg3?: JetRouteHandler | RouteBase
  ): RouteBase;
  addHandler(
    arg1?: string | JetRouteHandler | RouteBase,
    arg2?: string | JetRouteHandler | RouteBase,
    arg3?: JetRouteHandler | RouteBase
  ): RouteBase;
  addHandler(
    arg1?:
      | string
      | JetRouteHandler
      | RouteBase
      | JetWSRouteHandler
      | JetWSRouteBase,
    arg2?:
      | string
      | JetRouteHandler
      | RouteBase
      | JetWSRouteHandler
      | JetWSRouteBase,
    arg3?:
      | JetRouteHandler
      | RouteBase
      | JetWSRouteHandler
      | JetWSRouteBase
      | JetWSRoutePredicate,
    arg4?: JetWSRoutePredicate
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
      const rb = new JetWSRouteBase(pattern, handler, predicate);
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

  removeHandler(routeBase: RouteBase | JetWSRouteBase) {
    const index = this.stack.indexOf(routeBase);
    if (index === -1) return false;
    this.stack.splice(index, 1);
    return true;
  }
}
