
const express = require("express");
const app = express();

app.use(express.json({ limit: "10kb" }));

app.get("/", (req, res) => {
    res.send("Roblox Gemini backend is running!");
});

app.post("/chat", async (req, res) => {
    try {
        // Check the Roblox secret
        if (
            !process.env.ROBLOX_SECRET ||
            req.get("x-roblox-secret") !== process.env.ROBLOX_SECRET
        ) {
            return res.status(401).json({
                error: "Unauthorized"
            });
        }

        const message = req.body?.message;

        if (
            typeof message !== "string" ||
            !message.trim() ||
            message.length > 500
        ) {
            return res.status(400).json({
                error: "Message must be 1-500 characters."
            });
        }

        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "GEMINI_API_KEY is missing in Render."
            });
        }

        // Try models in order until one works.
        const models = [
            "gemini-3.8-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.6-flash",
            "gemini-3-flash-preview"
        ];

        const errors = [];

        for (const model of models) {
            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-goog-api-key": apiKey
                        },
                        body: JSON.stringify({
                            contents: [{
                                parts: [{
                                    text: message.trim()
                                }]
                            }]
                        }),
                        signal: AbortSignal.timeout(20000)
                    }
                );

                const data = await response.json();

                if (response.ok) {
                    const reply = data.candidates?.[0]?.content?.parts
                        ?.map(part => part.text || "")
                        .join("");

                    if (reply) {
                        console.log("Working Gemini model:", model);
                        return res.json({ reply });
                    }

                    errors.push(`${model}: No text returned`);
                    continue;
                }

                const status = response.status;
                const detail = data.error?.message || "Unknown API error";

                console.error(
                    `Model ${model} failed (${status}): ${detail}`
                );

                // Try another model for unavailable models,
                // temporary limits, or server errors.
                if (
                    status === 404 ||
                    status === 429 ||
                    status >= 500
                ) {
                    errors.push(`${model}: HTTP ${status}`);
                    continue;
                }

                // Invalid key or another request/configuration error.
                return res.status(502).json({
                    error: `Gemini API error (${status}). Check Render logs.`
                });
            } catch (error) {
                console.error(`Model ${model} error:`, error.message);
                errors.push(`${model}: Request failed`);
            }
        }

        console.error("All Gemini models failed:", errors);

        return res.status(502).json({
            error: "All Gemini models failed. Check Render logs and API access."
        });
    } catch (error) {
        console.error("Backend error:", error.message);

        return res.status(500).json({
            error: "Internal server error."
        });
    }
});

const port = process.env.PORT || 3000;

app.listen(port, "0.0.0.0", () => {
    console.log("Gemini AI backend loaded!");
});

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
