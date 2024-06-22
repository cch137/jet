import type { JetRequest, JetResponse, JetSocket } from "./http";
import http, { JetWSServer } from "./http.js";
import Router from "./route.js";
import bodyParser from "./body-parser.js";

export type { JetRequest, JetResponse, JetSocket };
export { Router, bodyParser };

export default class Jet extends http.Server {
  static readonly bodyParser = bodyParser;
  static readonly Router = Router;

  readonly wss = new JetWSServer({ noServer: true });
  private readonly route = new Router();
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
