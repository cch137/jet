import http from "http";
import { type ParamsDictionary } from "./route";

declare module "http" {
  interface IncomingMessage<P extends ParamsDictionary = {}> {
    ip: string;
    params: P;
  }
  interface ServerResponse {
    status(code?: number, message?: string): this;
    send(data: string | Buffer | Uint8Array): this;
  }
}

const singleString = (data: string | string[] | undefined): string =>
  data === undefined ? "" : Array.isArray(data) ? data[0] : data;
const isNotEmptyString = (data: any): data is string =>
  typeof data === "string" ? /^\s*$/.test(data) : false;
const trimIps = (ips: string): string => ips.split(",")[0].trim();

http.IncomingMessage.prototype.params = {};

Object.defineProperty(http.IncomingMessage.prototype, "ip", {
  get: function () {
    const headers = (this as http.IncomingMessage).headers;

    return trimIps(
      singleString(
        (this as http.IncomingMessage).socket.remoteAddress ||
          headers["cf-connecting-ip"] ||
          headers["x-forwarded-for"] ||
          headers["x-real-ip"]
      )
    );
  },
});

http.ServerResponse.prototype.send = function send(
  data: string | Buffer | Uint8Array
) {
  this.write(data);
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

export type JetRequest<P extends ParamsDictionary = {}> =
  http.IncomingMessage<P>;

export type JetResponse = http.ServerResponse<http.IncomingMessage> & {
  req: http.IncomingMessage;
};

export default http;
