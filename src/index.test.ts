import Jet from "./index.js";
import ws from "ws";

const jet = new Jet();

const router = new Jet.Router();

router.get("/", (req, res) => {
  console.log("root OK");
  res.send("OK");
});

jet.use("/", router);

jet.use("/", (req, res) => {
  res.end();
});

const room1 = new Jet.Room();
const room2 = new Jet.Room();
const room3 = new Jet.Room();

const wsRouter = new Jet.Router();

wsRouter.ws("/ws-test", (soc) => {
  soc.ping();
  soc.on("pong", () => {
    room1.join(soc);
    console.log("pong");
  });
});

jet.use("/ws-1", wsRouter);

jet.listen(3000, () => {
  console.log("listening on http://localhost:3000");
  const createSoc = (id: number) => {
    const soc = new ws("ws://localhost:3000/ws-1/ws-test");
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
  // fetch("http://localhost:3000/");
});

process.on("uncaughtException", (e) => console.log(e.message));
