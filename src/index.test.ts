import { JetServer, Route } from ".";

const server = new JetServer();
const router1 = new Route();

for (let i = 1; i < 1000000; i++) {
  router1.get(`/room${i}`, (req, res) => {
    res.status(200).send(`Room${i} ${JSON.stringify(req.params)}`);
  });
}

server.get("/users/:userId?", function (req, res) {
  res.send(`user: ${req.params.userId || ""}`);
});

server.get("/:a/:b/test", (req, res) => {
  console.log(req.params);
  res.send("OK");
});

server.use((req, res, next) => {
  console.log(req.ip, req.method, req.url, req.rawHeaders, req.headers);
  next();
});
server.get("/home1", router1);
server.get("/home2", router1);

const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
  console.log(`listening on port http://localhost:${PORT}`);
});
