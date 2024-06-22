import qs from "qs";
import type { JetRequest, JetResponse } from "./http.js";

const formType = /application\/x-www-form-urlencoded/;
const jsonType = /application\/json/;
const uint8arrayType = /application\/uint8array/;

const parseContentType = (
  contentType?: string
): { type?: "json" | "form" | "uint8array"; charset?: string } => {
  if (!contentType) return {};
  let charset: string | undefined;
  const charsetMatch = contentType.match(/charset=([^\s;]+)/);
  if (charsetMatch && charsetMatch.length > 1) charset = charsetMatch[1];
  if (jsonType.test(contentType)) return { type: "json", charset };
  if (formType.test(contentType)) return { type: "form", charset };
  if (uint8arrayType.test(contentType)) return { type: "uint8array", charset };
  return {};
};

export async function readBody(req: JetRequest) {
  const chunks: Uint8Array[] = [];
  req.on("data", (chunk: Uint8Array) => {
    chunks.push(chunk);
  });
  const body = await new Promise<Uint8Array>((resolve) => {
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
  const { type: contentType, charset } = parseContentType(
    req.headers["content-type"]
  );
  switch (contentType) {
    case "form": {
      return qs.parse(new TextDecoder(charset).decode(body));
    }
    case "json": {
      return JSON.parse(new TextDecoder(charset).decode(body));
    }
    case "uint8array": {
      return body;
    }
    default: {
      try {
        return JSON.parse(new TextDecoder(charset).decode(body));
      } catch {
        try {
          return qs.parse(new TextDecoder(charset).decode(body));
        } catch {}
      }
    }
  }
}

export default async function bodyParser(
  req: JetRequest,
  res: JetResponse,
  next: () => void
) {
  try {
    req.body = await readBody(req);
  } finally {
    next();
  }
}
