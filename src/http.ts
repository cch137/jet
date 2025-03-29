import http from "http";
import cookie, { type SerializeOptions } from "cookie";
import mime from "mime";

import type { ParamsDictionary } from "./route.js";
import { UAParser } from "ua-parser-js";
import type formidable from "formidable";
import type IIncomingForm from "formidable/Formidable.js";
import send from "send";
import qs, { parse as qsParse } from "qs";
import type Jet from "./index.js";

declare module "http" {
  interface IncomingMessage<P extends ParamsDictionary = {}> {
    server: Jet;
    urlObject: URL;
    readonly ip: string;
    readonly ua: UAParser.IResult;
    readonly charset: string;
    readonly protocol: string;
    readonly cookies: Partial<{ [key: string]: string }>;
    readonly [JetParsed]: boolean;
    params: P;
    getHeader(name: string): string | undefined;
    body:
      | undefined
      | null
      | number
      | string
      | { [key: string]: unknown }
      | unknown[]
      | IIncomingForm
      | Uint8Array;
    query: qs.ParsedQs | { [key: string]: unknown };
    files?: formidable.Files<string>;
  }
  interface ServerResponse {
    send(data: any): this;
    sendFile(path: string, options?: send.SendOptions): Promise<this>;
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
const JetURLObject = Symbol("url");
const JetCookies = Symbol("cookies");
const JetCharset = Symbol("charset");
export const JetParsed = Symbol("parsed");

const extractHeader = (
  data: string | string[] | undefined
): string | undefined =>
  data ? (Array.isArray(data) ? data[0] : data) : void 0;

http.IncomingMessage.prototype.params = {};

http.IncomingMessage.prototype.getHeader = function getHeader(name: string) {
  return extractHeader(this.headers[name]);
};

Object.defineProperty(http.IncomingMessage.prototype, "urlObject", {
  get: function () {
    return (this[JetURLObject] ||= new URL(
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

Object.defineProperty(http.IncomingMessage.prototype, "charset", {
  get: function () {
    return (this[JetCharset] ||=
      String(this.headers["content-type"] || "").match(
        /charset=([^\s;]+)/
      )?.[1] || "utf-8");
  },
});

Object.defineProperty(http.IncomingMessage.prototype, JetParsed, {
  get() {
    return false;
  },
  set(v) {
    if (v) {
      Object.defineProperty(this, JetParsed, {
        value: true,
        configurable: false,
        writable: false,
      });
    }
  },
  configurable: true,
});

export const qsDecoder: qs.IParseBaseOptions["decoder"] = (
  str,
  defaultDecoder,
  charset,
  type
) => {
  const fallback = () => defaultDecoder(str, undefined, charset);
  if (type === "key") return fallback();
  const strWithoutPlus = str.replace(/\+/g, " ");
  const decodedTrimmed = decodeURIComponent(strWithoutPlus).trim();
  switch (decodedTrimmed) {
    case "":
      return fallback();
    case "true":
      return true;
    case "false":
      return false;
  }
  const numeric = Number(decodedTrimmed);
  if (!isNaN(numeric)) return numeric;
  return fallback();
};

Object.defineProperty(http.IncomingMessage.prototype, "query", {
  get() {
    return (this.query = qsParse(
      (this as JetRequest).urlObject.search.slice(1),
      (this as JetRequest).server.qsParseOptions
    ));
  },
  set(v) {
    Object.defineProperty(this, "query", {
      value: v,
      writable: true,
      configurable: true,
    });
  },
  configurable: true,
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

http.ServerResponse.prototype.sendFile = function sendFile(
  path: string,
  options?: send.SendOptions
) {
  return new Promise((resolve, reject) => {
    send(this.req, path, options)
      .on("error", reject)
      .on("end", () => resolve(this))
      .pipe(this);
  });
};

export type JetRequest<P extends ParamsDictionary = {}> =
  http.IncomingMessage<P> & NodeJS.ReadableStream;

export type JetResponse = http.ServerResponse<http.IncomingMessage> & {
  req: http.IncomingMessage;
} & NodeJS.WritableStream;

export { qs, send, mime, cookie, UAParser };

export default http;
