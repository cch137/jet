import Jet, { type JetRouter, WebSocket } from "./index.js";
import ws from "ws";

const jet = new Jet();

const router = new Jet.Router();

type JR = JetRouter;

router.use(Jet.cors());

router.get("/", (req, res) => {
  console.log("root OK", req.ua);
  res.send("OK");
});

jet.use("/", router);

jet.use("/", (req, res) => {
  res.end();
});

const room1 = new Jet.WSRoom();
const room2 = new Jet.WSRoom();
const room3 = new Jet.WSRoom();

const wsRouter = new Jet.Router();

wsRouter.ws("/ws-test", (soc) => {
  soc.ping();
  soc.on("pong", () => {
    soc.join(room1);
    console.log("pong");
  });
});

jet.use("/ws-1", wsRouter);
const PORT = 4000;
jet.listen(PORT, () => {
  console.log(`listening on http://localhost:${PORT}`);
  const createSoc = (id: number) => {
    const soc = new ws(`ws://localhost:${PORT}/ws-1/ws-test`);
    soc.on("pong", () => {
      console.log(`client-${id} pong`);
    });
    soc.on("message", (data, isBinary) => {
      console.log(`client-${id} message`, data.toString(), isBinary);
    });
    soc.on("close", () => {
      console.log(`client-${id} close`);
    });
    return soc;
  };
  try {
    const soc1 = createSoc(1);
    const soc2 = createSoc(2);
    const soc3 = createSoc(3);
  } catch {
    console.log("ws failed");
  }
  fetch(`http://localhost:${PORT}/`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0",
    },
  })
    .then(async (res) => console.log(res.status, await res.text()))
    .catch((e) => console.log(e.message));
});

process.on("uncaughtException", (e) => console.log(e.message));
