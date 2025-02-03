import type { HTTPRequest, HTTPResponse } from "./http.js";
import { WebSocketServer, WSRoom, WSChannel } from "./ws.js";
import type { WebSocket } from "./ws.js";
import Router from "./route.js";

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

export const JetWebSocketServer = WebSocketServer;
export type JetWebSocketServer = WebSocketServer;
export type JetSocket = WebSocket;
export const JetWSRoom = WSRoom;
export type JetWSRoom = WSRoom;
export const JetWSChannel = WSChannel;
export type JetWSChannel = WSChannel;

export const JetRouter = Router;
export type JetRouter = Router;

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
