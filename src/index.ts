import http, { cookie, UAParser } from "./http.js";
import WebSocket from "./ws.js";

import type { JetRequest, JetResponse } from "./http.js";
import type { JetSocket } from "./ws.js";
import type { JetRouteHandler, JetWSRouteHandler } from "./route.js";
import type { JetCORSOptions } from "./cors.js";

import { JetWebSocketServer, JetWSRoom, JetWSChannel } from "./ws.js";
import { JetRouter } from "./route.js";
import { BiSet } from "./utils.js";
import { cors } from "./cors.js";
import { bodyParser } from "./body-parser.js";
import { getParams } from "./get-params.js";

export { http, UAParser, cookie, WebSocket };

export type {
  JetRequest,
  JetResponse,
  JetSocket,
  JetRouteHandler,
  JetWSRouteHandler,
  JetCORSOptions,
  JetWebSocketServer,
  JetRouter,
  JetWSRoom,
  JetWSChannel,
};

export default class Jet extends http.Server {
  static readonly http = http;
  static readonly cookie = cookie;
  static readonly UAParser = UAParser;
  static readonly WebSocket = WebSocket;

  static readonly Router = JetRouter;
  static readonly WSRoom = JetWSRoom;
  static readonly WSChannel = JetWSChannel;
  static readonly BiSet = BiSet;

  static readonly cors = cors;
  static readonly bodyParser = bodyParser;
  static readonly getParams = getParams;

  readonly wss = new JetWebSocketServer({ noServer: true });
  readonly route = new JetRouter();
  readonly use = this.route.use;
  readonly get = this.route.get;
  readonly post = this.route.post;
  readonly put = this.route.put;
  readonly delete = this.route.delete;
  readonly head = this.route.head;
  readonly trace = this.route.trace;
  readonly patch = this.route.patch;
  readonly connect = this.route.connect;
  readonly options = this.route.options;
  readonly ws = this.route.ws;
  readonly static = this.route.static;

  constructor(options: http.ServerOptions = {}) {
    super(options, (req, res) => {
      this.route.handle(req, res, () => {
        res.status(404).end();
      });
    });
    this.on("upgrade", (req, soc, head) => {
      this.route.handleSocket(this.wss, soc, req, head, () => {
        soc.destroy();
      });
    });
  }
}
