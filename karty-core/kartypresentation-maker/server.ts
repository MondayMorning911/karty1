import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API route for proxying images to avoid CORS issues
  app.get("/api/proxy", async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).send("Missing url parameter");
      }

      const response = await fetch(targetUrl);
      if (!response.ok) {
        return res.status(response.status).send(`Error fetching map: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      
      // Set CORS headers so html-to-image can fetch it
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", response.headers.get("content-type") || "image/png");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).send("Internal server error");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
