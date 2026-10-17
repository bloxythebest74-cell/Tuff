
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));

// Keep the API key on the server, never in the website.
const MODEL_PREFERENCES = [
    "models/gemini-3.8-flash",
    "models/gemini-3.5-flash-lite",
    "models/gemini-2.5-flash-lite",
    "models/gemini-2.5-flash"
];

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
    res.json({ status: "running" });
});

async function generateWithGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error(
            "GEMINI_API_KEY is missing in Render Environment."
        );
    }

    // Ask Google which models this API key can access.
    const listResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
        {
            headers: { "x-goog-api-key": apiKey },
            signal: AbortSignal.timeout(20000)
        }
    );

    const listData = await listResponse.json();

    if (!listResponse.ok) {
        throw new Error(
            listData.error?.message || "Could not retrieve Gemini models."
        );
    }

    // Allow only known text-generation models.
    // This prevents accidentally selecting a TTS model.
    const availableNames = new Set(
        (listData.models || [])
            .filter(model =>
                model.supportedGenerationMethods?.includes("generateContent")
            )
            .map(model => model.name)
    );

    const models = MODEL_PREFERENCES.filter(name =>
        availableNames.has(name)
    );

    if (models.length === 0) {
        throw new Error(
            "No supported text model from the configured list is available " +
            "to this API key. Check the available models in Google AI Studio."
        );
    }

    let lastError = "Gemini could not generate a response.";

    for (const model of models) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": apiKey
                    },
                    body: JSON.stringify({
                        contents: [{
                            role: "user",
                            parts: [{ text: prompt }]
                        }],
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 4000
                        }
                    }),
                    signal: AbortSignal.timeout(60000)
                }
            );

            const data = await response.json();

            if (!response.ok) {
                lastError =
                    data.error?.message ||
                    `${model} returned HTTP ${response.status}`;

                console.error(`${model}: ${lastError}`);

                // Try the next allowed model if this one fails.
                continue;
            }

            const answer = data.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("");

            if (answer) {
                return answer;
            }

            lastError = `${model} returned no text.`;
        } catch (error) {
            lastError = error.message || "Gemini request failed.";
            console.error(`${model}: ${lastError}`);
        }
    }

    throw new Error(
        "All available text models failed. Google may have reached your " +
        "quota limit. Check https://ai.dev/rate-limit . Details: " +
        lastError
    );
}

// Website generation
app.post("/website-generate", async (req, res) => {
    try {
        const { type, idea } = req.body || {};

        const allowedTypes = [
            "game",
            "animation",
            "map",
            "ui",
            "effects",
            "gameplay"
        ];

        if (!allowedTypes.includes(type)) {
            return res.status(400).json({
                error: "Choose a valid creation type."
            });
        }

        if (typeof idea !== "string" || !idea.trim()) {
            return res.status(400).json({
                error: "Please describe what you want to create."
            });
        }

        const prompt = `
You help beginners build Roblox projects using Studio Lite.

Creation type: ${type}
User request: ${idea.trim()}

Give a useful, practical solution.
For scripts, provide complete Luau code and explain where it belongs.
Do not invent asset IDs or claim an animation was uploaded when it was not.
If a task requires an animation asset, explain that limitation clearly.
`;

        const result = await generateWithGemini(prompt);

        res.json({
            success: true,
            reply: result
        });
    } catch (error) {
        console.error("Website generation failed:", error.message);

        res.status(500).json({
            error: error.message || "Generation failed."
        });
    }
});

// Protected endpoint for Roblox requests
app.post("/generate-game", async (req, res) => {
    try {
        const secret = process.env.ROBLOX_SECRET;

        if (!secret) {
            return res.status(500).json({
                error: "ROBLOX_SECRET is missing in Render Environment."
            });
        }

        if (req.headers["x-roblox-secret"] !== secret) {
            return res.status(401).json({
                error: "Unauthorized."
            });
        }

        const { prompt } = req.body || {};

        if (typeof prompt !== "string" || !prompt.trim()) {
            return res.status(400).json({
                error: "Please provide a prompt."
            });
        }

        const result = await generateWithGemini(prompt.trim());

        res.json({
            success: true,
            gamePlan: result
        });
    } catch (error) {
        console.error("Roblox request failed:", error.message);

        res.status(500).json({
            error: error.message || "Generation failed."
        });
    }
});

app.use((req, res) => {
    res.status(404).json({ error: "Route not found." });
});

app.listen(PORT, () => {
    console.log(`Roblox AI Game Builder running on port ${PORT}`);
});
