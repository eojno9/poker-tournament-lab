import { createApp } from "./app.js";

const port = Number(process.env.PORT || 4174);
const app = createApp();

app.listen(port, () => {
  console.log(`poker-tournament-lab API listening on http://localhost:${port}`);
});
