import { createStaticServer } from "./server.mjs";

const port = Number(process.argv[2] || process.env.PORT || 8080);
const server = createStaticServer(process.cwd());

server.listen(port, "127.0.0.1", () => {
  console.log(`Прочитано: http://127.0.0.1:${port}/`);
});
