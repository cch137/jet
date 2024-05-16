import Jet, { Route } from ".";

const jet = new Jet();
const router1 = new Route();

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

jet.use((req, res, next) => {
  next();
});
jet.get("/home1", router1);
jet.get("/home2", router1);

const PORT = process.env.PORT || 3000;

jet.listen(PORT, async () => {
  console.log(`listening on port http://localhost:${PORT}`);
});
