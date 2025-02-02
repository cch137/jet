import http, { cookie as httpCookie } from "./http.js";
import WS, { JetWSServer, Room, Channel } from "./ws.js";
import Router from "./route.js";
import cors from "./cors.js";
import bodyParser from "./body-parser.js";
import getParams from "./get-params.js";
import { BiSet } from "./utils.js";

export namespace Jet {
  export const cookie = httpCookie;
  export const WebSocket = WS;

  export type JetRequest = import("./http.js").JetRequest;
  export type JetResponse = import("./http.js").JetResponse;
  export type JetCookieOptions = import("./http.js").JetCookieOptions;
  export type JetSocket = import("./ws.js").JetSocket;

  export class Jet extends http.Server {
    static readonly cookie = httpCookie;
    static readonly cors = cors;
    static readonly bodyParser = bodyParser;
    static readonly getParams = getParams;
    static readonly http = http;
    static readonly WebSocket = WS;
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
}

export default Jet.Jet;
