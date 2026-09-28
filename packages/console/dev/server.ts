import index from "./index.html";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3210),
  routes: { "/": index },
  development: true,
});

console.log(`console dev: ${server.url}`);
