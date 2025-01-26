import type { JetRequest, JetResponse } from "./http.js";

type CORSOptions = {
  credentials?: string;
  origin?: string;
  methods?: string;
  headers?: string;
};

export default function cors({
  credentials = "true",
  origin = "*",
  methods = "*",
  headers = "*",
}: CORSOptions = {}) {
  return (req: JetRequest, res: JetResponse, next: () => void) => {
    res.setHeader("Access-Control-Allow-Credentials", credentials);
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", methods);
    res.setHeader("Access-Control-Allow-Headers", headers);
    if (req.method === "OPTIONS") {
      res.setHeader("Content-Length", "0");
      res.status(204).end();
    } else {
      next();
    }
  };
}
