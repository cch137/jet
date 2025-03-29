import { statSync, existsSync } from "fs";
import { resolve, relative, join } from "path";

import type { JetRequest, JetResponse } from "./http.js";
import type { JetSocket } from "./ws.js";
import { Duplex, JetWebSocketServer } from "./ws.js";

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

export type ParamsDictionary = {
  [key: string]: string;
};

export type JetRouteNextHandler = () => void | Promise<void>;

export type JetRouteHandler<Params extends ParamsDictionary = {}> = (
  req: JetRequest<Params>,
  res: JetResponse,
  next: JetRouteNextHandler
) => any | Promise<any>;

export type JetWSRouteHandler<Params extends ParamsDictionary = {}> = (
  soc: JetSocket,
  req: JetRequest<Params>,
  head: Buffer
) => any | Promise<any>;

export type JetWSRoutePredicate<Params extends ParamsDictionary = {}> = (
  soc: Duplex,
  req: JetRequest<Params>,
  head: Buffer
) => boolean | Promise<boolean>;

export type JetRouteDefiner = {
  <P extends string | undefined>(
    pathPattern: P,
    handler: JetRouteHandler<RouteParameters<P extends string ? P : "">>
  ): JetRouteBase;
  <P extends string | undefined>(
    pathPattern: P,
    handler: JetRouteBase
  ): JetRouteBase;
  (handler: JetRouteHandler): JetRouteBase;
  (handler: JetRouteBase): JetRouteBase;
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

const isHttpRoutable = (
  pattern: any
): pattern is JetRouteHandler | JetRouteBase =>
  isFunction(pattern) || pattern instanceof JetRouteBase;

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

export class JetRouteBase {
  readonly method?: HTTPMethod;
  readonly pattern?: string;
  readonly handler?: JetRouteHandler | JetRouteBase | JetRouter;

  constructor(
    method?: HTTPMethod,
    pattern?: string,
    handler?: JetRouteHandler | JetRouteBase
  ) {
    this.method = method;
    this.pattern = pattern;
    this.handler = handler;
  }

  async handle(
    req: JetRequest,
    res: JetResponse,
    next: JetRouteNextHandler,
    root?: string,
    currentPattern?: string
  ): Promise<void> {
    const handler = this.handler;
    if (!handler) {
      return await next();
    } else if (handler instanceof JetRouteBase) {
      return await handler.handle(req, res, next, root, currentPattern);
    } else {
      return await handler(req, res, next);
    }
  }
}

export class JetWSRouteBase {
  readonly pattern?: string;
  readonly handler?: JetWSRouteHandler | JetWSRouteBase | JetRouter;
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
    if (!handler) {
      return await next();
    }
    if (handler instanceof JetWSRouteBase || handler instanceof JetRouter) {
      await handler.handleSocket(
        wss,
        soc,
        req,
        head,
        next,
        root,
        currentPattern
      );
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

export class StaticRouter extends JetRouteBase {
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

  async handle(
    req: JetRequest,
    res: JetResponse,
    next: JetRouteNextHandler,
    root: string = "",
    currentPattern: string = ""
  ) {
    const pathaname = req.jetURL.pathname;
    const filepath = relative(currentPattern, pathaname);
    const absFilepath = join(this.root, filepath);
    const notFound = async () => {
      await super.handle(req, res, next, root, currentPattern);
    };
    if (!existsSync(absFilepath)) {
      return await notFound();
    }
    const stat = statSync(absFilepath);
    if (stat.isFile()) {
      await res.sendFile(absFilepath);
      return;
    }
    const { index } = this;
    if (!stat.isDirectory() || !index.length) {
      return await notFound();
    }
    for (const filename of index) {
      const indexFilepath = join(absFilepath, filename);
      const stat = statSync(indexFilepath);
      if (stat.isFile()) {
        if (pathaname.endsWith("/")) {
          await res.sendFile(indexFilepath);
        } else {
          res.redirect(`${pathaname}/`);
        }
        return;
      }
    }
    return await notFound();
  }
}

type HTTPRouteArg1 = string | HTTPRouteArg2;
type HTTPRouteArg2 = JetRouteHandler | JetRouteBase;
type WSRouteArg1 = string | JetWSRouteHandler | JetWSRouteBase;
type WSRouteArg2 = JetWSRouteHandler | JetWSRouteBase | JetWSRoutePredicate;
type WSRouteArg3 = JetWSRoutePredicate;

export class JetRouter extends JetRouteBase {
  readonly stack: (JetRouteBase | JetWSRouteBase)[] = [];

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

  static(root: string, options?: ServeStaticOptions): JetRouteBase;
  static(
    patern: string | undefined,
    root: string,
    options?: ServeStaticOptions
  ): JetRouteBase;
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
    if (stack.length === 0) return await next();
    for (const handler of stack) {
      if (handler instanceof JetWSRouteBase) continue;
      const currPattern = `${root}${handler.pattern || ""}`;
      const { isMatch, params } = matchRoute(
        handler.method,
        currPattern,
        method,
        decodeURIComponent(jetURL.pathname),
        handler.handler instanceof JetRouteBase || !handler.pattern
      );
      if (!isMatch) continue;
      const isHandled = await new Promise<boolean>(async (resolve) => {
        req.params = params || {};
        const onClose = () => resolve(true);
        res.once("close", onClose);
        await handler.handle(
          req,
          res,
          () => {
            resolve(false);
            res.off("close", onClose);
          },
          root,
          currPattern
        );
      });
      if (isHandled) {
        return;
      }
    }
    return await next();
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
    if (stack.length === 0) return await next();
    for (const handler of stack) {
      const isRouter = handler.handler instanceof JetRouter;
      if (handler instanceof JetRouteBase && !isRouter) continue;
      const currPattern = `${root}${handler.pattern || ""}`;
      const { isMatch, params } = matchRoute(
        undefined,
        currPattern,
        undefined,
        decodeURIComponent(url.pathname),
        isRouter || !handler.pattern
      );
      if (!isMatch) continue;
      const isHandled = await new Promise<boolean>(async (resolve) => {
        req.params = params || {};
        const onClose = () => resolve(true);
        soc.once(HANDLED, onClose);
        await (isRouter
          ? handler.handler
          : (handler as JetWSRouteBase)
        ).handleSocket(
          wss,
          soc,
          req,
          head,
          () => {
            resolve(false);
            soc.off(HANDLED, onClose);
          },
          root,
          currPattern
        );
      });
      if (isHandled) return;
    }
    return await next();
  }

  addHandler(
    arg1?: WSMethod | JetWSRouteHandler | JetWSRouteBase,
    arg2?: string | JetWSRouteHandler | JetWSRouteBase,
    arg3?: JetWSRouteHandler | JetWSRouteBase | JetWSRoutePredicate,
    arg4?: JetWSRoutePredicate
  ): JetWSRouteBase;
  addHandler(
    arg1?: HTTPMethod | JetRouteHandler | JetRouteBase,
    arg2?: string | JetRouteHandler | JetRouteBase,
    arg3?: JetRouteHandler | JetRouteBase
  ): JetRouteBase;
  addHandler(
    arg1?: string | JetRouteHandler | JetRouteBase,
    arg2?: string | JetRouteHandler | JetRouteBase,
    arg3?: JetRouteHandler | JetRouteBase
  ): JetRouteBase;
  addHandler(
    arg1?:
      | string
      | JetRouteHandler
      | JetRouteBase
      | JetWSRouteHandler
      | JetWSRouteBase,
    arg2?:
      | string
      | JetRouteHandler
      | JetRouteBase
      | JetWSRouteHandler
      | JetWSRouteBase,
    arg3?:
      | JetRouteHandler
      | JetRouteBase
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
    const rb = new JetRouteBase(
      method,
      [arg2, arg1].find(isString) || "",
      [arg3, arg2, arg1].find(isHttpRoutable)
    );
    this.stack.push(rb);
    return rb;
  }

  removeHandler(routeBase: JetRouteBase | JetWSRouteBase) {
    const index = this.stack.indexOf(routeBase);
    if (index === -1) return false;
    this.stack.splice(index, 1);
    return true;
  }
}
