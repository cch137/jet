import http, { JetWSServer } from "./http";
import Route from "./route";

export { Route };

export default class Jet extends http.Server {
  private readonly route = new Route();
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

  readonly wss = new JetWSServer({ noServer: true });

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