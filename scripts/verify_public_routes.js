const app = require('../src/app');

const server = app.listen(0, async () => {
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1/public`;

  try {
    for (const path of ['/stats', '/jobs?limit=2', '/companies?limit=2']) {
      const response = await fetch(`${baseUrl}${path}`);
      const body = await response.text();
      console.log(`${path}: ${response.status}`);
      if (!response.ok) {
        console.log(body);
        process.exitCode = 1;
        break;
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
