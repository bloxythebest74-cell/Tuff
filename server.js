
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));

// Open the website at the main URL
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Also serve other files in the public folder
app.use(express.static(path.join(__dirname, "public")));

// Check that the backend is running
app.get("/health", (req, res) => {
    res.json({ status: "running" });
});

// Generate content with Gemini
async function generateWithGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing in Render environment variables.");
    }

    // Find available Gemini models
    const modelsResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
        {
            headers: {
                "x-goog-api-key": apiKey
            },
            signal: AbortSignal.timeout(20000)
        }
    );

    const modelsData = await modelsResponse.json();

    if (!modelsResponse.ok) {
        throw new Error(
            modelsData.error?.message || "Could not find Gemini models."
        );
    }

    const models = (modelsData.models || [])
        .filter(model =>
            model.supportedGenerationMethods?.includes("generateContent")
        )
        .sort((a, b) => {
            const preferred = [
                "models/gemini-2.5-flash",
                "models/gemini-2.0-flash",
                "models/gemini-2.5-flash-lite"
            ];

            const aIndex = preferred.indexOf(a.name);
            const bIndex = preferred.indexOf(b.name);

            return (aIndex === -1 ? 999 : aIndex) -
                   (bIndex === -1 ? 999 : bIndex);
        });

    if (models.length === 0) {
        throw new Error("No Gemini models supporting text generation were found.");
    }

    let lastError = "Gemini generation failed.";

    for (const model of models.slice(0, 5)) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/${model.name}:generateContent`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": apiKey
                    },
                    body: JSON.stringify({
                        contents: [
                            {
                                parts: [
                                    { text: prompt }
                                ]
                            }
                        ],
                        generationConfig: {
                            maxOutputTokens: 6000,
                            temperature: 0.7
                        }
                    }),
                    signal: AbortSignal.timeout(60000)
                }
            );

            const data = await response.json();

            if (!response.ok) {
                lastError = data.error?.message ||
                    `Gemini returned HTTP ${response.status}`;
                console.error(`${model.name}: ${lastError}`);
                continue;
            }

            const answer = data.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("");

            if (answer) {
                return answer;
            }

            lastError = "Gemini returned no text. Try a different request.";
        } catch (error) {
            lastError = error.message || "Gemini request failed.";
            console.error(`${model.name}: ${lastError}`);
        }
    }

    throw new Error(lastError);
}

// Website generator
app.post("/website-generate", async (req, res) => {
    try {
        const { type, idea } = req.body || {};

        if (typeof idea !== "string" || !idea.trim()) {
            return res.status(400).json({
                error: "Please enter what you want to create."
            });
        }

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
                error: "Please choose a valid creation type."
            });
        }

        const prompt = `
You are an assistant helping a beginner create Roblox games using Studio Lite.

Creation type: ${type}

User's idea:
${idea.trim()}

Give a practical, beginner-friendly result.
For Roblox code, use valid Luau and explain where each script belongs.
Prefer complete scripts over fragments.
Do not claim that an animation asset has been created or uploaded unless it actually has.
If the request needs a custom animation asset, explain that limitation and give the next practical step.
Do not invent Roblox asset IDs.
`;

        const result = await generateWithGemini(prompt);

        res.json({
            success: true,
            reply: result
        });
    } catch (error) {
        console.error("Website generation error:", error.message);

        res.status(500).json({
            error: error.message || "Something went wrong."
        });
    }
});

// Roblox game endpoint
app.post("/generate-game", async (req, res) => {
    try {
        const secret = process.env.ROBLOX_SECRET;

        if (!secret) {
            return res.status(500).json({
                error: "ROBLOX_SECRET is missing in Render environment variables."
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
                error: "A prompt is required."
            });
        }

        const result = await generateWithGemini(prompt.trim());

        res.json({
            success: true,
            gamePlan: result
        });
    } catch (error) {
        console.error("Roblox generation error:", error.message);

        res.status(500).json({
            error: error.message || "Game generation failed."
        });
    }
});

// Unknown routes
app.use((req, res) => {
    res.status(404).json({
        error: "Route not found."
    });
});

app.listen(PORT, () => {
    console.log(`Roblox AI Game Builder running on port ${PORT}`);
});
