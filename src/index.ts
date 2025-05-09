import http, { qs, send, mime, cookie, UAParser, qsDecoder } from "./http.js";
import WebSocket from "./ws.js";

import type { JetRequest, JetResponse } from "./http.js";
import type { JetSocket } from "./ws.js";
import type { JetRouteHandler, JetWSRouteHandler } from "./route.js";
import { JetWebSocketServer, JetWSRoom, JetWSChannel } from "./ws.js";
import { JetRouter } from "./route.js";
import { BiSet } from "./utils.js";

import type { JetCORSOptions } from "./middlewares/cors.js";
import { cors } from "./middlewares/cors.js";
import { bodyParser, formidable } from "./middlewares/body-parser.js";
import { mergeQuery } from "./middlewares/merge-query.js";
import { noCache } from "./middlewares/no-cache.js";

export { http, qs, send, mime, cookie, formidable, UAParser, WebSocket };

type JetErrorHandler = (
  req: JetRequest,
  res: JetResponse,
  error: unknown
) => void;

export type {
  JetRequest,
  JetResponse,
  JetSocket,
  JetRouteHandler,
  JetWSRouteHandler,
  JetErrorHandler,
  JetCORSOptions,
  JetWebSocketServer,
  JetRouter,
  JetWSRoom,
  JetWSChannel,
};

const defaultErrorHandler: JetErrorHandler = (_, res) => {
  res.status(500);
  res.end();
};

export type JetServerOptions = http.ServerOptions &
  Partial<{
    qsParseOptions: qs.IParseOptions;
    errorHandler: JetErrorHandler;
  }>;

export default class Jet extends http.Server {
  static readonly Router = JetRouter;
  static readonly WSRoom = JetWSRoom;
  static readonly WSChannel = JetWSChannel;
  static readonly BiSet = BiSet;

  static readonly cors = cors;
  static readonly bodyParser = bodyParser;
  static readonly mergeQuery = mergeQuery;
  static readonly noCache = noCache;

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

  qsParseOptions?: qs.IParseOptions;
  errorHandler: JetErrorHandler;

  constructor({
    qsParseOptions = { decoder: qsDecoder },
    errorHandler = defaultErrorHandler,
    ...options
  }: JetServerOptions = {}) {
    super(options, async (req, res) => {
      try {
        req.server = this;
        await this.route.handle(req, res, () => {
          res.status(404).end();
        });
      } catch (e) {
        this.errorHandler(req, res, e);
      }
    });
    this.qsParseOptions = qsParseOptions;
    this.errorHandler = errorHandler;
    this.on("upgrade", (req, soc, head) => {
      this.route.handleSocket(this.wss, soc, req, head, () => {
        soc.destroy();
      });
    });
  }
}
