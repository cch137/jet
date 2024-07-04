import type { JetRequest, JetResponse, JetCookieOptions } from "./http.js";
import http, { cookie } from "./http.js";
import type { JetSocket } from "./ws.js";
import WebSocket, { JetWSServer, Room, Channel } from "./ws.js";
import Router from "./route.js";
import bodyParser from "./body-parser.js";
import { BiSet } from "./utils.js";

export type { JetRequest, JetResponse, JetCookieOptions, JetSocket };
export { cookie, bodyParser, http, WebSocket, Router, Room, Channel, BiSet };

export default class Jet extends http.Server {
  static readonly cookie = cookie;
  static readonly bodyParser = bodyParser;
  static readonly http = http;
  static readonly WebSocket = WebSocket;
  static readonly Router = Router;
  static readonly Room = Room;
  static readonly Channel = Channel;
  static readonly BiSet = BiSet;

  readonly wss = new JetWSServer({ noServer: true });
  readonly route = new Router();
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
