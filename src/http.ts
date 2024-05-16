import http from "http";
import { type ParamsDictionary } from "./route";

declare module "http" {
  interface IncomingMessage<P extends ParamsDictionary = {}> {
    ip: string;
    params: P;
  }
  interface ServerResponse {
    status(code?: number, message?: string): this;
    send(data: any): Promise<this>;
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
    !(
      typeof data === "string" ||
      data instanceof Uint8Array ||
      data instanceof Buffer
    )
  ) {
    data = JSON.stringify(data);
  }
  return new Promise((resolve, reject) => {
    this.write(data, (e) => {
      if (e) reject(e);
    });
    this.end(() => resolve(this));
  });
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
