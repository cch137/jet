import type { HTTPRequest, HTTPResponse } from "./http.js";
import { WebSocketServer, JetWSRoom, JetWSChannel } from "./ws.js";
import type { JetSocket } from "./ws.js";
import JetRouter from "./route.js";

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

export type JetRequest<P extends ParamsDictionary = {}> = HTTPRequest<P>;
export type JetResponse = HTTPResponse;

export {
  WebSocketServer as JetWebSocketServer,
  JetSocket,
  JetWSRoom,
  JetWSChannel,
  JetRouter,
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

export type JetCORSOptions = {
  credentials?: true;
  origin?: string;
  methods?: string[];
  headers?: string[];
};
