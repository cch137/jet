import type { HTTPRequest, HTTPResponse } from "./http.js";
import { WebSocketServer, WSRoom, WSChannel } from "./ws.js";
import type { WebSocket } from "./ws.js";
import type { RouteHandler, WSRouteHandler } from "./route.js";
import Router from "./route.js";

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
export type JetRouteHandler = RouteHandler;
export type JetWSRouteHandler = WSRouteHandler;

export type JetCORSOptions = {
  credentials?: true;
  origin?: string;
  methods?: string[];
  headers?: string[];
};
