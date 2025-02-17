import http from "http";
import cookie, { type SerializeOptions } from "cookie";
import mime from "mime";

import type { ParamsDictionary } from "./route.js";
import { UAParser } from "ua-parser-js";

export type JetParsedUserAgent = UAParser.IResult;

declare module "http" {
  interface IncomingMessage<P extends ParamsDictionary = {}> {
    jetURL: URL;
    readonly ip: string;
    readonly ua: JetParsedUserAgent;
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
    setCookie(name: string, value: string, options?: SerializeOptions): this;
    removeCookie(name: string, options?: SerializeOptions): this;
  }
}

const JetIp = Symbol("ip");
const JetUa = Symbol("ua");
const JetProtocol = Symbol("protocol");
const JetURL = Symbol("url");
const JetCookies = Symbol("cookies");

const extractHeader = (
  data: string | string[] | undefined
): string | undefined =>
  data ? (Array.isArray(data) ? data[0] : data) : void 0;

http.IncomingMessage.prototype.params = {};

http.IncomingMessage.prototype.getHeader = function getHeader(name: string) {
  return extractHeader(this.headers[name]);
};

Object.defineProperty(http.IncomingMessage.prototype, "jetURL", {
  get: function () {
    return (this[JetURL] ||= new URL(
      this.url || "",
      `${this.protocol}://${this.getHeader("host")}`
    ));
  },
});

Object.defineProperty(http.IncomingMessage.prototype, "protocol", {
  get: function () {
    if (this[JetProtocol]) return this[JetProtocol];
    const cfVisitorMatched = (this.getHeader("cf-visitor") || "").match(
      /"scheme":"(.*)"/
    );
    return (this[JetProtocol] =
      (cfVisitorMatched
        ? cfVisitorMatched[1]
        : this.getHeader("x-forwarded-proto")) || "http");
  },
});

Object.defineProperty(http.IncomingMessage.prototype, "ip", {
  get: function () {
    return (this[JetIp] ||=
      extractHeader(this.headers["cf-connecting-ip"]) ||
      (extractHeader(this.headers["x-forwarded-for"]) || "")
        .split(",")[0]
        .trim() ||
      extractHeader(this.headers["true-client-ip"]) ||
      this.socket.remoteAddress ||
      "");
  },
});

Object.defineProperty(http.IncomingMessage.prototype, "ua", {
  get: function () {
    return (this[JetUa] ||= UAParser(this.headers["user-agent"]) || "");
  },
});

Object.defineProperty(http.IncomingMessage.prototype, "cookies", {
  get: function () {
    if (this[JetCookies]) return this[JetCookies];
    const rawCookie = extractHeader(this.headers["cookie"]);
    return (this[JetCookies] = rawCookie ? cookie.parse(rawCookie) : {});
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
  this.type("json");
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
  this.setHeader("Location", encodeURI(url));
  this.send(content);
  return this;
};

export type JetRequest<P extends ParamsDictionary = {}> =
  http.IncomingMessage<P> & NodeJS.ReadableStream;

export type JetResponse = http.ServerResponse<http.IncomingMessage> & {
  req: http.IncomingMessage;
} & NodeJS.WritableStream;

export { cookie };

export default http;
