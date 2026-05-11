const http = require("http");
const fs = require("fs");
const path = require("path");
const chokidar = require("chokidar");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 80;
const publicDir = __dirname;

// MIME типы
const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".woff": "application/font-woff",
  ".ttf": "application/font-ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".otf": "application/font-otf",
  ".wasm": "application/wasm",
};

// Список подключенных клиентов для уведомлений об изменениях
const clients = [];

// Флаг для отслеживания готовности к отправке уведомлений
let watcherReady = false;

const server = http.createServer((req, res) => {
  // Endpoint для Server-Sent Events (SSE)
  if (req.url === "/__hot_reload") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    clients.push(res);

    res.write("data: connected\n\n");

    req.on("close", () => {
      clients.splice(clients.indexOf(res), 1);
    });
    return;
  }

  let filePath = path.join(publicDir, req.url === "/" ? "index.html" : req.url);

  // Безопасность: не выходить за пределы publicDir
  const realPath = path.resolve(filePath);
  if (!realPath.startsWith(path.resolve(publicDir))) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }

    if (stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("500 Internal Server Error");
        return;
      }

      // Инъектируем скрипт горячей перезагрузки в HTML
      let contentToServe = content;
      if (filePath.endsWith(".html")) {
        const scriptInjection = `
<script>
(function() {
  const connectSSE = () => {
    const sse = new EventSource('/__hot_reload');
    sse.onmessage = (event) => {
      if (event.data === 'reload') {
        console.log('[Hot Reload] Изменения обнаружены. Перезагружаю...');
        location.reload();
      }
    };
    sse.onerror = () => {
      sse.close();
      setTimeout(connectSSE, 1000);
    };
  };
  connectSSE();
})();
</script>`;
        contentToServe = content
          .toString()
          .replace("</body>", scriptInjection + "</body>");
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || "application/octet-stream";

      res.writeHead(200, { "Content-Type": contentType });
      res.end(contentToServe);
    });
  });
});

// Наблюдение за изменениями файлов
const watchDir = (dir) => {
  const watcher = chokidar.watch(dir, {
    ignored: /(^|[\/\\])\.|node_modules/,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 100,
    },
  });

  watcher.on("ready", () => {
    watcherReady = true;
    console.log("✅ Наблюдение за файлами активно");
  });

  watcher.on("change", (filePath) => {
    if (watcherReady) {
      console.log(
        `[${new Date().toLocaleTimeString()}] Файл изменен: ${filePath}`,
      );

      // Уведомляем всех подключенных клиентов
      clients.forEach((client) => {
        client.write("data: reload\n\n");
      });
    }
  });

  watcher.on("error", (err) => {
    console.error("Ошибка при наблюдении за файлами:", err);
  });
};

server.listen(PORT, HOST, () => {
  console.log(`🚀 Dev сервер запущен на http://localhost:${PORT}`);
  console.log(`🌐 Доступ по сети: http://<IP-этого-компьютера>:${PORT}`);
  console.log(`📝 Наблюдение за изменениями файлов в: ${publicDir}`);
  watchDir(publicDir);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Порт ${PORT} уже занят. Попробуйте другой порт.`);
  } else {
    console.error("Ошибка сервера:", err);
  }
  process.exit(1);
});
