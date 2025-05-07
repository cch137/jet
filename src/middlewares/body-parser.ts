import qs from "qs";
import formidable, { IncomingForm } from "formidable";

import { JetParsed, type JetRequest, type JetResponse } from "../http.js";
import type { JetRouteHandler, JetRouteNextHandler } from "../route.js";

export { formidable };

const urlencodedTypeReg = /application\/x-www-form-urlencoded/;
const multipartTypeReg = /multipart\/form-data/;
const jsonTypeReg = /application\/json/;
const textTypeReg = /text\/plain/;
const bufferTypeReg = /application\/octet-stream/;

const readBody = (req: JetRequest) => {
  return new Promise<Uint8Array>(async (resolve, reject) => {
    const chunks: Uint8Array[] = [];
    req.on("data", (chunk: Uint8Array) => {
      chunks.push(chunk);
    });
    req.on("error", (err) => {
      reject(err);
    });
    req.on("end", () => {
      const totalLength = chunks.reduce((acc, arr) => acc + arr.length, 0);
      const concatenatedArray = new Uint8Array(totalLength);
      let offset = 0;
      chunks.forEach((chunk) => {
        concatenatedArray.set(chunk, offset);
        offset += chunk.length;
      });
      resolve(concatenatedArray);
    });
  });
};

const ContentTypes = {
  json: Symbol(),
  urlencoded: Symbol(),
  multipart: Symbol(),
  buffer: Symbol(),
  text: Symbol(),
} as const;

type ContentType = keyof typeof ContentTypes;

const getContentTypeSymbol = (
  contentType?: string,
  defaultContentType?: ContentType
): (typeof ContentTypes)[ContentType] | null => {
  if (!contentType)
    return defaultContentType ? ContentTypes[defaultContentType] : null;
  if (jsonTypeReg.test(contentType)) return ContentTypes.json;
  if (urlencodedTypeReg.test(contentType)) return ContentTypes.urlencoded;
  if (multipartTypeReg.test(contentType)) return ContentTypes.multipart;
  if (bufferTypeReg.test(contentType)) return ContentTypes.buffer;
  if (textTypeReg.test(contentType)) return ContentTypes.text;
  return defaultContentType ? ContentTypes[defaultContentType] : null;
};

export const bodyParser = ({
  defaultContentType,
  json: jsonParams = [],
  urlencoded: urlencodedParams = [],
  multipart: multipartParams = [],
  buffer: bufferParams = [],
  text: textParams = [],
}: Partial<{
  defaultContentType?: ContentType;
  json?: Parameters<typeof json>;
  urlencoded?: Parameters<typeof urlencoded>;
  multipart?: Parameters<typeof multipart>;
  buffer?: Parameters<typeof buffer>;
  text?: Parameters<typeof text>;
}> = {}) => {
  const handler = async (
    req: JetRequest,
    res: JetResponse,
    next: JetRouteNextHandler
  ) => {
    if (req.method === "HEAD") return await next();
    if (req.method === "GET") return await next();
    if (req.method === "TRACE") return await next();

    switch (
      getContentTypeSymbol(req.headers["content-type"], defaultContentType)
    ) {
      case ContentTypes.json:
        return await handler.jsonHandler(req, res, next);
      case ContentTypes.urlencoded:
        return await handler.urlencodedHandler(req, res, next);
      case ContentTypes.multipart:
        return await handler.multipartHandler(req, res, next);
      case ContentTypes.buffer:
        return await handler.bufferHandler(req, res, next);
      case ContentTypes.text:
        return await handler.textHandler(req, res, next);
    }
    await next();
  };

  handler.jsonHandler = bodyParser.json(...jsonParams);
  handler.urlencodedHandler = bodyParser.urlencoded(...urlencodedParams);
  handler.multipartHandler = bodyParser.multipart(...multipartParams);
  handler.bufferHandler = bodyParser.buffer(...bufferParams);
  handler.textHandler = bodyParser.text(...textParams);

  return handler;
};

const setParsed = (req: JetRequest) => {
  Object.defineProperty(req, JetParsed, {
    value: true,
    writable: false,
    enumerable: false,
    configurable: false,
  });
};

const json = (reviver?: Parameters<typeof JSON.parse>[1]): JetRouteHandler => {
  return async (req, _, next) => {
    if (req.method === "HEAD") return await next();
    if (req.method === "GET") return await next();
    if (req.method === "TRACE") return await next();
    if (req[JetParsed]) return await next();
    try {
      const body = await readBody(req);
      req.body = JSON.parse(new TextDecoder(req.charset).decode(body), reviver);
    } catch {}
    setParsed(req);
    await next();
  };
};

const urlencoded = (
  options?: qs.IParseOptions<qs.BooleanOptional>
): JetRouteHandler => {
  return async (req, _, next) => {
    if (req.method === "HEAD") return await next();
    if (req.method === "GET") return await next();
    if (req.method === "TRACE") return await next();
    if (req[JetParsed]) return await next();
    const body = await readBody(req);
    req.body = qs.parse(new TextDecoder(req.charset).decode(body), options);
    setParsed(req);
    await next();
  };
};

const multipart = (
  options?:
    | Partial<formidable.Options>
    | ((req: JetRequest) => Partial<formidable.Options> | undefined)
    | ((req: JetRequest) => Promise<Partial<formidable.Options> | undefined>)
): JetRouteHandler => {
  return typeof options === "function"
    ? async (req, _, next) => {
        if (req.method === "HEAD") return await next();
        if (req.method === "GET") return await next();
        if (req.method === "TRACE") return await next();
        if (req[JetParsed]) return await next();
        const [fields, files] = await new IncomingForm(
          await options(req)
        ).parse(req);
        req.body = fields;
        req.files = files;
        setParsed(req);
        await next();
      }
    : async (req, _, next) => {
        if (req.method === "HEAD") return await next();
        if (req.method === "GET") return await next();
        if (req.method === "TRACE") return await next();
        if (req[JetParsed]) return await next();
        const [fields, files] = await new IncomingForm(options).parse(req);
        req.body = fields;
        req.files = files;
        setParsed(req);
        await next();
      };
};

const _buffer: JetRouteHandler = async (req, _, next) => {
  if (req.method === "HEAD") return await next();
  if (req.method === "GET") return await next();
  if (req.method === "TRACE") return await next();
  if (req[JetParsed]) return await next();
  req.body = await readBody(req);
  setParsed(req);
  await next();
};

const buffer = (): JetRouteHandler => _buffer;

const _text: JetRouteHandler = async (req, _, next) => {
  if (req.method === "HEAD") return await next();
  if (req.method === "GET") return await next();
  if (req.method === "TRACE") return await next();
  if (req[JetParsed]) return await next();
  const body = await readBody(req);
  req.body = new TextDecoder(req.charset).decode(body);
  setParsed(req);
  await next();
};

const text = (): JetRouteHandler => _text;

bodyParser.json = json;
bodyParser.urlencoded = urlencoded;
bodyParser.multipart = multipart;
bodyParser.buffer = buffer;
bodyParser.text = text;
