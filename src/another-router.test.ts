import { statSync, existsSync } from "fs";
import { resolve, relative, join } from "path";
import send from "send";

import type {
  JetRequest,
  JetResponse,
  JetWebSocketServer,
  JetSocket,
} from "./types.js";
import { Duplex } from "./ws.js";

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

const isFunction = (f: any): f is Function => typeof f === "function";

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

export type RoutePreparer<Reference, Destination> = (
  ref: Reference,
  des: Destination
) => Route<Reference, Destination>;

class Route<R, D> {
  static from<R, D>(ref: R, des: D): Route<R, D>;
  static from<R, D>(route: Route<R, D>): Route<R, D>;
  static from<R, D>(arg1: R | Route<R, D>, arg2?: D) {
    return arg1 instanceof Route ? arg1 : new Route<R, D>(arg1, arg2!);
  }

  readonly reference: R;
  readonly destination: D;

  constructor(reference: R, destination: D) {
    this.reference = reference;
    this.destination = destination;
  }
}

export type Parser<Target, Reference, Parsed> = (
  tar: Target,
  ref: Reference
) => Parsed | null;

class Router<Target, Reference, Destinantion, Parsed> {
  static Route = Route;

  constructor(parser: Parser<Target, Reference, Parsed>) {
    this.parser = parser;
  }

  routes: Route<
    Reference,
    Destinantion | Router<Target, Reference, Destinantion, Parsed>
  >[] = [];

  parser: Parser<Target, Reference, Parsed>;

  addRoute(
    reference: Reference,
    destination: Destinantion
  ): Route<Reference, Destinantion>;
  addRoute(
    route: Route<Reference, Destinantion>
  ): Route<Reference, Destinantion>;
  addRoute(
    reference: Reference,
    destination: Router<Target, Reference, Destinantion, Parsed>
  ): Route<Reference, Router<Target, Reference, Destinantion, Parsed>>;
  addRoute(
    arg1:
      | Reference
      | Route<Reference, Destinantion>
      | Route<Reference, Router<Target, Reference, Destinantion, Parsed>>,
    arg2?: Destinantion | Router<Target, Reference, Destinantion, Parsed>
  ) {
    const route = Route.from(arg1, arg2) as Route<
      Reference,
      Destinantion | Router<Target, Reference, Destinantion, Parsed>
    >;
    this.routes.push(route);
    return route;
  }

  removeRoute(
    reference: Reference,
    destination: Destinantion
  ): Route<Reference, Destinantion> | null;
  removeRoute(route: Route<Reference, Destinantion>): boolean;
  removeRoute(
    arg1: Reference | Route<Reference, Destinantion>,
    arg2?: Destinantion
  ) {
    if (arg1 instanceof Route) {
      const index = this.routes.indexOf(arg1);
      if (index === -1) return false;
      this.routes.splice(index, 1);
      return true;
    }
    const { routes } = this,
      { length } = routes;
    for (let i = 0; i < length; i++) {
      const item = routes[i];
      if (item.reference !== arg1 || item.destination !== arg2) continue;
      this.routes.splice(i, 1);
      return item;
    }
    return null;
  }

  find(
    target: Target,
    resolve: (des: Destinantion, parseds: Parsed[]) => any | Promise<any>,
    reject: () => void,
    parseds?: Parsed[]
  ): Destinantion | void {
    for (const route of this.routes) {
      const { reference, destination } = route;
      const parsed = this.parser(target, reference);
      if (parsed === null) continue;
      if (destination instanceof Router)
        return destination.find(target, resolve, reject, parseds);
      if (parseds) parseds.push(parsed);
      else parseds = [parsed];
      return resolve(destination, parseds);
    }
    reject();
  }
}

export type RouteNextHandler = () => void | Promise<void>;

export type RouteHandler<Params extends ParamsDictionary = {}> = (
  req: JetRequest<Params>,
  res: JetResponse,
  next: RouteNextHandler
) => any | Promise<any>;

export type WSRouteHandler<Params extends ParamsDictionary = {}> = (
  soc: JetSocket,
  req: JetRequest<Params>,
  head: Buffer
) => any | Promise<any>;

export type WSRoutePredicate<Params extends ParamsDictionary = {}> = (
  soc: Duplex,
  req: JetRequest<Params>,
  head: Buffer
) => boolean | Promise<boolean>;

type JetRouteRef = { method?: HTTPMethod | WSMethod; pattern?: string };
type JetRouteDes =
  | JetRouter
  | RouteHandler
  | [WSRouteHandler | JetRouter, WSRoutePredicate | undefined]
  | [WSRouteHandler | JetRouter];

export type JetRouteDefHTTP = {
  <P extends string | undefined>(
    pathPattern: P,
    handler: RouteHandler<RouteParameters<P extends string ? P : "">>
  ): Route<JetRouteRef, RouteHandler>;
  <P extends string | undefined>(pathPattern: P, router: JetRouter): Route<
    JetRouteRef,
    JetRouter
  >;
  (handler: RouteHandler): Route<JetRouteRef, RouteHandler>;
  (router: JetRouter): Route<JetRouteRef, JetRouter>;
};

export type JetRouteDefWS = {
  <P extends string | undefined>(
    pathPattern: P,
    handler: WSRouteHandler<RouteParameters<P extends string ? P : "">>,
    predicate?: WSRoutePredicate<RouteParameters<P extends string ? P : "">>
  ): Route<JetRouteRef, [WSRouteHandler, WSRoutePredicate] | [WSRouteHandler]>;
  <P extends string | undefined>(
    pathPattern: P,
    router: JetRouter,
    predicate?: WSRoutePredicate<RouteParameters<P extends string ? P : "">>
  ): Route<JetRouteRef, [JetRouter, WSRouteHandler] | [JetRouter]>;
  (handler: WSRouteHandler, predicate?: WSRoutePredicate): Route<
    JetRouteRef,
    [WSRouteHandler, WSRoutePredicate] | [WSRouteHandler]
  >;
  (router: JetRouter, predicate?: WSRoutePredicate): Route<
    JetRouteRef,
    [JetRouter, WSRoutePredicate] | [JetRouter]
  >;
};

const toPattern = (pattern?: string) =>
  pattern ? pattern.replace(/(\/|\\)+/, "/") : pattern;

const matchMethod = (tar: JetRequest, ref: JetRouteRef) =>
  !ref.method || !ref.method || tar.method === ref.method;

type HTTPRouteArg1 = string | RouteHandler | JetRouter;
type HTTPRouteArg2 = RouteHandler | JetRouter;
type WSRouteArg1 = string | WSRouteHandler | JetRouter;
type WSRouteArg2 = WSRouteHandler | JetRouter | WSRoutePredicate;
type WSRouteArg3 = WSRoutePredicate;

const HANDLED = Symbol("handled");

const mergeParseds = <P extends object>(parseds: P[]): P => {
  if (parseds.length === 1) return parseds[0];
  const obj: Partial<P> = {};
  for (const o of parseds) Object.assign(obj, o);
  return obj as P;
};

const createHTTPRoute = (method?: HTTPMethod) =>
  ((arg1: HTTPRouteArg1, arg2?: HTTPRouteArg2) =>
    typeof arg1 === "string"
      ? (this as any as JetRouter).addRoute(
          method ? { method, pattern: arg1 } : { pattern: arg1 },
          arg2 as RouteHandler
        )
      : (this as any as JetRouter).addRoute(
          method ? { method } : {},
          (arg2 || arg1) as RouteHandler
        )) as JetRouteDefHTTP;

class JetRouter extends Router<
  [JetRequest, JetResponse] | [Duplex, JetRequest, Buffer],
  JetRouteRef,
  RouteHandler | [WSRouteHandler, WSRoutePredicate] | [WSRouteHandler],
  ParamsDictionary
> {
  static createRoute(
    ref: JetRouteRef,
    des: JetRouteDes
  ): Route<JetRouteRef, JetRouteDes>;
  static createRoute(
    route: Route<JetRouteRef, JetRouteDes>
  ): Route<JetRouteRef, JetRouteDes>;
  static createRoute(
    arg1: JetRouteRef | Route<JetRouteRef, JetRouteDes>,
    arg2?: JetRouteDes
  ) {
    const route = Route.from(arg1 as JetRouteRef, arg2!);
    route.reference.pattern = toPattern(route.reference.pattern);
    return route;
  }

  constructor() {
    super((tar, ref) => {
      throw new Error("Not implemented");
      // const [req, res, soc, head] =
      //   tar.length === 2
      //     ? [tar[0], tar[1], null, null]
      //     : [tar[1], null, tar[0], tar[2]];
      // const routePattern = (ref.pattern || "").replace(/(\/|\\)+/, "/");
      // if (!(!routeMethod || routeMethod === method)) return { isMatch: false };
      // if (!routePattern) return { isMatch: true };
      // if (!routePattern.includes(":"))
      //   return {
      //     isMatch: url
      //       ? matchStart
      //         ? url.startsWith(routePattern)
      //         : url === routePattern
      //       : true,
      //   };
      // if (!url) return { isMatch: false };
      // const routeParts = routePattern.split("/");
      // const urlParts = url.split("/");
      // const partLength = routeParts.length;
      // if (!matchStart && partLength !== urlParts.length)
      //   return { isMatch: false };
      // const params: ParamsDictionary = {};
      // for (let i = 0; i < partLength; i++) {
      //   const routePart = routeParts[i];
      //   const urlPart = urlParts[i];
      //   const isParamPart = routePart.startsWith(":");
      //   if (isParamPart) {
      //     const isOptional = routePart.endsWith("?");
      //     const paramName = routePart.substring(
      //       1,
      //       routePart.length - (isOptional ? 1 : 0)
      //     );
      //     if (!isOptional && !urlPart) return { isMatch: false };
      //     params[paramName] = urlPart;
      //   } else if (urlPart !== routePart) return { isMatch: false };
      // }
      // return { isMatch: true, params };
    });
  }

  private static use = createHTTPRoute();
  private static get = createHTTPRoute("GET");
  private static post = createHTTPRoute("POST");
  private static put = createHTTPRoute("PUT");
  private static delete = createHTTPRoute("DELETE");
  private static head = createHTTPRoute("HEAD");
  private static trace = createHTTPRoute("TRACE");
  private static options = createHTTPRoute("OPTIONS");
  private static patch = createHTTPRoute("PATCH");
  private static connect = createHTTPRoute("CONNECT");

  use = JetRouter.use.bind(this);
  get = JetRouter.get.bind(this);
  post = JetRouter.post.bind(this);
  put = JetRouter.put.bind(this);
  delete = JetRouter.delete.bind(this);
  head = JetRouter.head.bind(this);
  trace = JetRouter.trace.bind(this);
  options = JetRouter.options.bind(this);
  patch = JetRouter.patch.bind(this);
  connect = JetRouter.connect.bind(this);

  ws = ((arg1: WSRouteArg1, arg2?: WSRouteArg2, arg3?: WSRouteArg3) =>
    typeof arg1 === "string"
      ? this.addRoute(
          { method: "WS", pattern: arg1 },
          arg3 ? [arg2 as WSRouteHandler, arg3] : [arg2 as WSRouteHandler]
        )
      : this.addRoute(
          { method: "WS" },
          arg2
            ? [arg1 as WSRouteHandler, arg2 as WSRoutePredicate]
            : [arg1 as WSRouteHandler]
        )) as JetRouteDefWS;

  handle(req: JetRequest, res: JetResponse, next: () => void): void;
  handle(
    wss: JetWebSocketServer,
    soc: Duplex,
    req: JetRequest,
    head: Buffer,
    next: () => void
  ): void;
  handle(
    ...args:
      | [req: JetRequest, res: JetResponse, next: () => void]
      | [
          wss: JetWebSocketServer,
          soc: Duplex,
          req: JetRequest,
          head: Buffer,
          next: () => void
        ]
  ): void;
  handle(
    ...args:
      | [req: JetRequest, res: JetResponse, next: () => void]
      | [
          wss: JetWebSocketServer,
          soc: Duplex,
          req: JetRequest,
          head: Buffer,
          next: () => void
        ]
  ) {
    if (args.length === 3) {
      const [req, res, next] = args;
      this.find(
        [req, res],
        async (des, parseds) => {
          if (Array.isArray(des)) throw new Error("Des is not a array");
          req.params = mergeParseds(parseds);
          des(req, res, next);
        },
        next
      );
    } else {
      const [wss, soc, req, head, next] = args;
      this.find(
        [soc, req, head],
        async (des, parseds) => {
          if (typeof des === "function")
            throw new Error("Des is not a function");
          const [handler, predicate] = des;
          req.params = mergeParseds(parseds);
          if (predicate && !(await predicate(soc, req, head))) {
            soc.destroy();
            return;
          }
          wss.handleUpgrade(req, soc, head, (ws, req) => {
            ws.on("close", () => (ws as JetSocket).rooms.clear());
            wss.emit("connection", ws, req, head);
            soc.emit(HANDLED);
            handler(ws as JetSocket, req, head);
          });
        },
        next
      );
    }
  }
}

const x = new JetRouter();
console.log(x.use(() => 1));
console.log(x.post("/aaa", () => 1));
console.log(x.ws(() => 1));
console.log(x.routes);
