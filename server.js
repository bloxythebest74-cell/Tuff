
const express = require("express");

const app = express();
app.use(express.json({ limit: "10kb" }));

app.get("/", (req, res) => {
  res.send("Roblox Gemini backend is running!");
});

app.post("/chat", async (req, res) => {
  try {
    // Require a private shared secret for Roblox requests.
    if (
      !process.env.ROBLOX_SECRET ||
      req.get("x-roblox-secret") !== process.env.ROBLOX_SECRET
    ) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const message = req.body?.message;

    if (typeof message !== "string" ||
        message.trim().length === 0 ||
        message.length > 500) {
      return res.status(400).json({
        error: "Message must be 1-500 characters."
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Server API key is not configured."
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: message.trim()
            }]
          }]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini request failed:", response.status);
      return res.status(502).json({
        error: "AI request failed."
      });
    }

    const answer = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("");

    if (!answer) {
      return res.status(502).json({
        error: "No AI response was returned."
      });
    }

    res.json({ reply: answer });
  } catch (error) {
    console.error("Request failed:", error.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});
