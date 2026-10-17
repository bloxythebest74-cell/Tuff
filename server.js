
const express = require("express");
const youtube = require("youtube-search-api");
const { execFile } = require("child_process");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        name: "Roblox Video Browser",
        status: "online",
        search: "/api/search?q=MrBeast",
        ffmpegTest: "/api/ffmpeg-check"
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
                return res.status(200).json({
                    success: false,
                    installed: false,
                    message: "FFmpeg is not available on this server."
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

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("Video browser backend running on port " + PORT);
});
