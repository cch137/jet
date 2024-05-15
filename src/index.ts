import http from "http";
import Route from "./route";

export { Route };
export type RequestParams = { [key: string]: string };

export class JetRequest<Params extends RequestParams = {}> {
  private readonly req: http.IncomingMessage;
  params: Params;

  constructor(req: http.IncomingMessage) {
    this.req = req;
    this.params = {} as Params;
  }

  get method() {
    return this.req.method;
  }

  get url() {
    return this.req.url || "/";
  }

  onend(cb: () => void) {
    this.req.once("end", cb);
  }
}

export class JetResponse {
  private readonly res: http.ServerResponse;
  constructor(res: http.ServerResponse) {
    this.res = res;
  }

  status(code?: number, message?: string) {
    if (typeof code === "number") this.res.statusCode = code;
    if (typeof message === "string") this.res.statusMessage = message;
    return this;
  }

  send(data: string | Buffer | Uint8Array) {
    this.res.write(data);
    this.res.end();
    return this;
  }

  end() {
    this.res.end();
    return this;
  }
}

export class JetServer extends http.Server {
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

  constructor(options: http.ServerOptions = {}) {
    super(options, (_req, _res) => {
      const req = new JetRequest(_req);
      const res = new JetResponse(_res);
      this.route.handle(req, res, () => {
        res.status(404).end();
      });
    });
  }
}
