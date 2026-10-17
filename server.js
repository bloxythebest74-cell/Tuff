
const express = require("express");
const app = express();

app.use(express.json({ limit: "10kb" }));

app.get("/", (req, res) => {
    res.send("Roblox AI Game Builder backend is running!");
});

// Discover models actually available to your API key.
async function findGeminiModel(apiKey) {
    const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
        {
            headers: {
                "x-goog-api-key": apiKey
            },
            signal: AbortSignal.timeout(15000)
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            "Could not list Gemini models: " +
            (data.error?.message || response.status)
        );
    }

    const available = (data.models || []).filter(model =>
        model.supportedGenerationMethods?.includes("generateContent")
    );

    // Prefer stable Flash models, but use another listed
    // Gemini model if those aren't available.
    const preferred = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-2.5-flash-lite"
    ];

    available.sort((a, b) => {
        const nameA = a.name.split("/").pop();
        const nameB = b.name.split("/").pop();

        const score = name =>
            preferred.indexOf(name) === -1
                ? 100
                : preferred.indexOf(name);

        return score(nameA) - score(nameB);
    });

    const selected = available.find(model =>
        model.name.startsWith("models/gemini-")
    );

    if (!selected) {
        throw new Error("No usable Gemini model was found.");
    }

    return selected.name;
}

app.post("/generate-game", async (req, res) => {
    try {
        // Protect the generator with your private backend secret.
        if (
            !process.env.ROBLOX_SECRET ||
            req.get("x-roblox-secret") !== process.env.ROBLOX_SECRET
        ) {
            return res.status(401).json({
                error: "Unauthorized. Check your backend secret."
            });
        }

        const idea = req.body?.idea;

        if (
            typeof idea !== "string" ||
            !idea.trim() ||
            idea.length > 1200
        ) {
            return res.status(400).json({
                error: "Describe your game in 1-1200 characters."
            });
        }

        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "GEMINI_API_KEY is missing in Render."
            });
        }

        const model = await findGeminiModel(apiKey);

        const prompt = `
You are an expert Roblox Lua game developer.
The user is building a game using Studio Lite on mobile.

GAME IDEA:
${idea.trim()}

Create a practical implementation plan for this Roblox game.

Rules:
1. Use Roblox Luau, not JavaScript, for Roblox scripts.
2. Explain where every script belongs.
3. Separate server Scripts and LocalScripts correctly.
4. Explain any Parts, Models, RemoteEvents, folders,
   or other objects that must exist.
5. Prefer scripts that create required objects when practical.
6. Give complete scripts, not incomplete fragments.
7. Make scripts work together and use consistent names.
8. Do not claim that you have inserted anything into Roblox.
9. If the project is too large for one answer, start with
   a working first version and list the next features.
10. Keep the instructions simple for a Studio Lite beginner.

Return:
GAME PLAN
OBJECTS TO CREATE
SCRIPTS AND THEIR LOCATIONS
FULL SCRIPT CODE
HOW TO TEST
`;

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
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 6000
                    }
                }),
                signal: AbortSignal.timeout(60000)
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error(
                "Gemini API error:",
                response.status,
                data.error?.message || "Unknown error"
            );

            return res.status(502).json({
                error: "Gemini failed. Check Render logs."
            });
        }

        const result = data.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("");

        if (!result) {
            return res.status(502).json({
                error: "Gemini returned no generated scripts."
            });
        }

        console.log("Game generated using:", model);

        return res.json({
            success: true,
            model: model,
            gamePlan: result
        });

    } catch (error) {
        console.error("Game generation error:", error.message);

        return res.status(500).json({
            error: "Game generation failed. Check Render logs."
        });
    }
});

const port = process.env.PORT || 3000;

app.listen(port, "0.0.0.0", () => {
    console.log("Roblox AI Game Builder backend loaded!");
});
