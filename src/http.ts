import http from "http";
import { type ParamsDictionary } from "./route";
import { computedPropDefine } from "./utils";

declare module "http" {
  interface IncomingMessage<P extends ParamsDictionary = {}> {
    _url: URL;
    readonly ip: string;
    readonly protocol: string;
    params: P;
    getHeader(name: string): string | undefined;
  }
  interface ServerResponse {
    send(data: any): this;
    json(data: any): this;
    type(type: string): this;
    status(code?: number, message?: string): this;
    redirect(url: string, options?: RedirectOptions): this;
  }
}

const extractHeader = (
  data: string | string[] | undefined
): string | undefined =>
  data ? (Array.isArray(data) ? data[0] : data) : void 0;

http.IncomingMessage.prototype.params = {};

http.IncomingMessage.prototype.getHeader = function getHeader(name: string) {
  return extractHeader(this.headers[name]);
};

computedPropDefine(http.IncomingMessage.prototype, "_url", function (obj) {
  return new URL(obj.url || "", `${obj.protocol}://${obj.getHeader("host")}`);
});

computedPropDefine(http.IncomingMessage.prototype, "protocol", function (obj) {
  const cfVisitorMatched = (obj.getHeader("cf-visitor") || "").match(
    /"scheme":"(.*)"/
  );
  return (
    (cfVisitorMatched
      ? cfVisitorMatched[1]
      : obj.getHeader("x-forwarded-proto")) || "http"
  );
});

computedPropDefine(http.IncomingMessage.prototype, "ip", function (obj) {
  const headers = obj.headers;
  return (
    extractHeader(headers["cf-connecting-ip"]) ||
    (extractHeader(headers["x-forwarded-for"]) || "").split(",")[0].trim() ||
    extractHeader(headers["true-client-ip"]) ||
    obj.socket.remoteAddress ||
    ""
  );
});

http.ServerResponse.prototype.send = function send(data: any) {
  if (data === undefined) return this.end();
  if (
    typeof data === "string" ||
    data instanceof Uint8Array ||
    data instanceof Buffer
  ) {
    this.write(data);
    this.end();
    return this;
  }
  return this.json(data);
};

http.ServerResponse.prototype.json = function json(data: any) {
  this.write(JSON.stringify(data));
  this.end();
  return this;
};

http.ServerResponse.prototype.status = function status(
  code?: number,
  message?: string
) {
  if (typeof code === "number") this.statusCode = code;
  if (typeof message === "string") this.statusMessage = message;
  return this;
};

http.ServerResponse.prototype.type = function type(type: string) {
  // this.setHeader('Content-Type', 'application/json');
  return this;
};

type RedirectOptions = Partial<{
  code: number;
  message: string;
  content: any;
}>;
http.ServerResponse.prototype.redirect = function redirect(
  url: string,
  { code = 302, message, content }: RedirectOptions = {}
) {
  this.status(code, message);
  this.setHeader("Location", url);
  this.send(content);
  return this;
};

export type JetRequest<P extends ParamsDictionary = {}> =
  http.IncomingMessage<P>;

export type JetResponse = http.ServerResponse<http.IncomingMessage> & {
  req: http.IncomingMessage;
};

export default http;
