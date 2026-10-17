
const express = require("express");
const youtube = require("youtube-search-api");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        name: "Roblox Video Browser",
        status: "online",
        search: "/api/search?q=music"
    });
});

app.get("/api/search", async (req, res) => {
    const query = String(req.query.q || "").trim();

    if (!query) {
        return res.status(400).json({
            success: false,
            error: "Enter a search query."
        });
    }

    if (query.length > 150) {
        return res.status(400).json({
            success: false,
            error: "Search query is too long."
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
            .map(item => {
                const thumbnails = Array.isArray(item.thumbnail)
                    ? item.thumbnail
                    : [];

                return {
                    id: item.id || item.videoId || "",
                    title: item.title || "Untitled",
                    channel:
                        item.channelTitle ||
                        item.shortBylineText ||
                        "",
                    thumbnail:
                        thumbnails.length > 0
                            ? thumbnails[thumbnails.length - 1].url || ""
                            : "",
                    isLive: Boolean(item.isLive)
                };
            });

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
            error: "YouTube search failed. Try again later."
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("Video browser backend running on port " + PORT);
});
