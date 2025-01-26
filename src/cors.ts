import type { JetRequest, JetResponse } from "./http.js";

export default function cors(
  req: JetRequest,
  res: JetResponse,
  next: () => void
) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.setHeader("Content-Length", "0");
    res.status(204).end();
  } else {
    next();
  }
}
