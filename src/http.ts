import http from "http";
import { type ParamsDictionary } from "./route";

declare module "http" {
  interface IncomingMessage<P extends ParamsDictionary = {}> {
    ip: string;
    params: P;
  }
  interface ServerResponse {
    send(data: any): this;
    json(data: any): this;
    type(type: string): this;
    status(code?: number, message?: string): this;
  }
}

const extractHeader = (data: string | string[] | undefined): string =>
  data ? (Array.isArray(data) ? data[0] : data) : "";

http.IncomingMessage.prototype.params = {};

Object.defineProperty(http.IncomingMessage.prototype, "ip", {
  get: function () {
    const headers = (this as http.IncomingMessage).headers;
    return (
      extractHeader(headers["cf-connecting-ip"]) ||
      extractHeader(headers["x-forwarded-for"]).split(",")[0].trim() ||
      extractHeader(headers["true-client-ip"]) ||
      (this as http.IncomingMessage).socket.remoteAddress ||
      ""
    );
  },
});

http.ServerResponse.prototype.send = function send(data: any) {
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

export type JetRequest<P extends ParamsDictionary = {}> =
  http.IncomingMessage<P>;

export type JetResponse = http.ServerResponse<http.IncomingMessage> & {
  req: http.IncomingMessage;
};

export default http;
