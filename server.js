
const express = require("express");
const youtube = require("youtube-search-api");
const { execFile } = require("child_process");
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        name: "Roblox Video Browser",
        status: "online",
        search: "/api/search?q=MrBeast",
        ffmpegTest: "/api/ffmpeg-check",
        websocketTest: "/ws-test-page"
    });
});

app.get("/api/search", async (req, res) => {
    const query = String(req.query.q || "").trim();

    if (!query || query.length > 150) {
        return res.status(400).json({
            success: false,
            error: "Enter a search query of up to 150 characters."
        });
    }

    try {
        const result = await youtube.GetListByKeyword(
            query,
            false,
            10,
            [{ type: "video" }]
        );

        const videos = (result.items || [])
            .filter(item => item.type === "video")
            .map(item => ({
                id: item.id || item.videoId || "",
                title: item.title || "Untitled",
                channel: item.channelTitle || "",
                thumbnail: Array.isArray(item.thumbnail)
                    ? item.thumbnail[item.thumbnail.length - 1]?.url || ""
                    : "",
                isLive: Boolean(item.isLive)
            }));

        res.json({
            success: true,
            query,
            count: videos.length,
            videos
        });
    } catch (error) {
        console.error("YouTube search failed:", error.message);

        res.status(502).json({
            success: false,
            error: "YouTube search failed."
        });
    }
});

app.get("/api/ffmpeg-check", (req, res) => {
    execFile(
        "ffmpeg",
        ["-version"],
        { timeout: 5000 },
        (error, stdout) => {
            if (error) {
                return res.json({
                    success: false,
                    installed: false
                });
            }

            res.json({
                success: true,
                installed: true,
                version: stdout.split("\n")[0]
            });
        }
    );
});

app.get("/ws-test-page", (req, res) => {
    res.type("html").send(`<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Live Connection Test</title>
<style>
body { font-family: sans-serif; padding: 20px; }
#status { font-weight: bold; }
#messages { white-space: pre-wrap; }
</style>
</head>
<body>
<h2>Live Connection Test</h2>
<p>Status: <span id="status">Connecting...</span></p>
<p>Messages received:</p>
<div id="messages"></div>
<script>
const status = document.getElementById("status");
const messages = document.getElementById("messages");

const protocol = location.protocol === "https:" ? "wss://" : "ws://";
const socket = new WebSocket(protocol + location.host + "/ws-test");

socket.onopen = () => {
    status.textContent = "Connected";
};

socket.onmessage = event => {
    messages.textContent += event.data + "\\n";
};

socket.onerror = () => {
    status.textContent = "Connection error";
};

socket.onclose = () => {
    status.textContent = "Disconnected";
};
</script>
</body>
</html>`);
});

const server = http.createServer(app);

const wss = new WebSocketServer({
    server,
    path: "/ws-test"
});

wss.on("connection", socket => {
    let count = 0;

    socket.send(JSON.stringify({
        type: "connected",
        message: "Live connection established"
    }));

    const timer = setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) {
            clearInterval(timer);
            return;
        }

        count++;

        socket.send(JSON.stringify({
            type: "test",
            number: count,
            time: new Date().toISOString()
        }));

        if (count >= 20) {
            clearInterval(timer);
            socket.close();
        }
    }, 1000);

    socket.on("close", () => clearInterval(timer));
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log("Video browser backend running on port " + PORT);
});
