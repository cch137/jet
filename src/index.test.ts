import { JetServer, Route } from ".";

const server = new JetServer();
const router1 = new Route();

for (let i = 1; i < 1000000; i++) {
  router1.get(`/room${i}`, (req, res) => {
    res.status(200).send(`Room${i}`);
  });
}

server.get("/:a/:b/test", (req, res) => {
  console.log(req.params);
  res.send("OK");
});

server.get("/home1", router1);
server.get("/home2", router1);

server.listen(3000, async () => {
  console.log("listening on port http://localhost:3000");
});
