
const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const Youtube = require("youtube-search-api");
const { execFile } = require("child_process");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "Roblox YouTube backend is running",
        routes: [
            "/api/search?q=Ronaldo",
            "/api/ffmpeg-check",
            "/ws-test-page"
        ]
    });
});

app.get("/api/search", async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();

        if (!q) {
            return res.status(400).json({
                error: "Please provide a search query."
            });
        }

        const results = await Youtube.GetListByKeyword(
            q,
            false,
            20
        );

        const items = (results.items || [])
            .filter(item => item.type === "video" || item.id)
            .map(item => ({
                title: item.title || "Untitled video",
                id: item.id || "",
                channel: item.channelTitle || "",
                thumbnail:
                    item.thumbnail?.thumbnails?.slice(-1)[0]?.url || ""
            }));

        res.json({ results: items });
    } catch (error) {
        console.error("YouTube search error:", error.message);

        res.status(500).json({
            error: "YouTube search failed."
        });
    }
});

app.get("/api/ffmpeg-check", (req, res) => {
    execFile("ffmpeg", ["-version"], (error, stdout) => {
        if (error) {
            return res.status(500).json({
                available: false,
                error: error.message
            });
        }

        res.json({
            available: true,
            version: stdout.split("\n")[0]
        });
    });
});

app.get("/ws-test-page", (req, res) => {
    res.type("html").send(`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WebSocket Test</title>
</head>
<body>
<h2>WebSocket Test</h2>
<pre id="status">Connecting...</pre>
<script>
const status = document.getElementById("status");
const protocol = location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(protocol + "//" + location.host);

socket.onopen = () => {
    status.textContent = "Connected to backend";
    socket.send("Hello from test page");
};

socket.onmessage = event => {
    status.textContent += "\\n" + event.data;
};

socket.onerror = () => {
    status.textContent += "\\nConnection error";
};

socket.onclose = () => {
    status.textContent += "\\nConnection closed";
};
</script>
</body>
</html>`);
});

wss.on("connection", socket => {
    socket.send("WebSocket connected successfully");

    socket.on("message", message => {
        socket.send("Server received: " + message.toString());
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("Backend listening on port " + PORT);
});
