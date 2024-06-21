import Jet, { Route } from ".";
import serveStatic from "./static";
import { WebSocket } from "ws";

const jet = new Jet();
const router1 = new Route();

jet.get("/home", (req, res) => {
  res.send("Hello World!");
});

for (let i = 1; i < 1000000; i++) {
  router1.get(`/room${i}`, (req, res) => {
    res.status(200).send(`Room${i} ${JSON.stringify(req.params)}`);
  });
}

jet.get("/users/:userId?", function (req, res) {
  res.send(`user: ${req.params.userId || ""}`);
});

jet.get("/:a/:b/test", (req, res) => {
  console.log(req.params);
  res.send("OK");
});

jet.get("/你好世界", (req, res) => {
  res.send("Hello World!");
});

jet.use("/static/", serveStatic("testdir", { index: ["index.html"] }));

jet.get("/home1", router1);
jet.get("/home2", router1);

jet.ws("/ws", (soc, req) => {
  console.log("socket connected from server");
  soc.send("Hi Socket!");
  soc.close();
});

const PORT = process.env.PORT || 3000;

jet.listen(PORT, async () => {
  console.log(`listening on port http://localhost:${PORT}`);
  setTimeout(async () => {
    const res = await fetch(
      `http://localhost:3000/${encodeURIComponent("你好世界")}`,
      {
        headers: { host: "https://www.google.com" },
      }
    );
    console.log("request text:", await res.text());
    const ws = new WebSocket("ws://localhost:3000/ws");
    ws.addEventListener("open", () => {
      console.log("WS connected.");
    });
    ws.addEventListener("error", (e) => {
      console.log("WS error:", e.message);
    });
    ws.addEventListener("message", (e) => {
      console.log("WS message.", e.data);
    });
    ws.addEventListener("close", () => {
      console.log("WS closed.");
    });
  }, 1000);
});
