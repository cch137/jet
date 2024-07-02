import http from "http";
import cookie, { type CookieSerializeOptions } from "cookie";
import mime from "mime";

import type { ParamsDictionary } from "./route.js";

declare module "http" {
  interface IncomingMessage<P extends ParamsDictionary = {}> {
    _url: URL;
    readonly ip: string;
    readonly protocol: string;
    readonly cookies: Partial<{ [key: string]: string }>;
    params: P;
    getHeader(name: string): string | undefined;
    body: any;
  }
  interface ServerResponse {
    send(data: any): this;
    json(data: any): this;
    type(type: string): this;
    status(code?: number, message?: string): this;
    redirect(url: string, options?: RedirectOptions): this;
    setCookie(name: string, value: string, options?: JetCookieOptions): this;
    removeCookie(name: string, options?: JetCookieOptions): this;
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

Object.defineProperty(http.IncomingMessage.prototype, "_url", {
  get: function () {
    return new URL(
      this.url || "",
      `${this.protocol}://${this.getHeader("host")}`
    );
  },
});

Object.defineProperty(http.IncomingMessage.prototype, "protocol", {
  get: function () {
    const cfVisitorMatched = (this.getHeader("cf-visitor") || "").match(
      /"scheme":"(.*)"/
    );
    return (
      (cfVisitorMatched
        ? cfVisitorMatched[1]
        : this.getHeader("x-forwarded-proto")) || "http"
    );
  },
});

Object.defineProperty(http.IncomingMessage.prototype, "ip", {
  get: function () {
    const headers = this.headers;
    return (
      extractHeader(headers["cf-connecting-ip"]) ||
      (extractHeader(headers["x-forwarded-for"]) || "").split(",")[0].trim() ||
      extractHeader(headers["true-client-ip"]) ||
      this.socket.remoteAddress ||
      ""
    );
  },
});

Object.defineProperty(http.IncomingMessage.prototype, "cookies", {
  get: function () {
    const rawCookie = extractHeader(this.headers["cookie"]);
    return rawCookie ? cookie.parse(rawCookie) : {};
  },
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

http.ServerResponse.prototype.setCookie = function setCookie(
  name,
  value,
  options
) {
  this.appendHeader("set-cookie", cookie.serialize(name, value, options));
  return this;
};

http.ServerResponse.prototype.removeCookie = function removeCookie(
  name,
  options = {}
) {
  delete options.maxAge;
  delete options.expires;
  return this.setCookie(name, "", options);
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
  if (code) this.statusCode = code;
  if (message) this.statusMessage = message;
  return this;
};

http.ServerResponse.prototype.type = function type(type: string) {
  this.setHeader("Content-Type", mime.getType(type) || type);
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
  http.IncomingMessage<P> & NodeJS.ReadableStream;

export type JetResponse = http.ServerResponse<http.IncomingMessage> & {
  req: http.IncomingMessage;
} & NodeJS.WritableStream;

export type JetCookieOptions = CookieSerializeOptions;

export { cookie };

export default http;
