
const express = require("express");
const app = express();

app.set("trust proxy", 1);
app.use(express.json({ limit: "10kb" }));
app.use(express.static("public"));

const requestCounts = new Map();

app.get("/", (req, res) => {
    res.send("Roblox AI Game Builder backend is running!");
});

function checkLimit(req) {
    const now = Date.now();
    const ip = req.ip || "unknown";
    const record = requestCounts.get(ip);

    if (!record || now - record.start >= 60000) {
        requestCounts.set(ip, { start: now, count: 1 });
        return true;
    }

    if (record.count >= 5) {
        return false;
    }

    record.count++;
    return true;
}

async function generateWithGemini(type, idea) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing in Render.");
    }

    // Ask Google which models this API key can access.
    const listResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
        {
            headers: { "x-goog-api-key": apiKey },
            signal: AbortSignal.timeout(15000)
        }
    );

    const listData = await listResponse.json();

    if (!listResponse.ok) {
        throw new Error(
            "Could not list Gemini models: " +
            (listData.error?.message || listResponse.status)
        );
    }

    const models = (listData.models || []).filter(model =>
        model.name.startsWith("models/gemini-") &&
        model.supportedGenerationMethods?.includes("generateContent")
    );

    const preferred = [
        "models/gemini-2.5-flash",
        "models/gemini-2.0-flash",
        "models/gemini-2.5-flash-lite"
    ];

    models.sort((a, b) => {
        const aIndex = preferred.indexOf(a.name);
        const bIndex = preferred.indexOf(b.name);

        return (aIndex < 0 ? 999 : aIndex) -
               (bIndex < 0 ? 999 : bIndex);
    });

    if (!models.length) {
        throw new Error("No usable Gemini models were found.");
    }

    const instructions = {
        game: "Plan a complete Roblox game with gameplay, progression, UI, and a map.",
        animation: "Help create a character animation. Explain rig requirements, keyframes, animation playback, and the valid asset publishing workflow. Do not invent an animation ID.",
        map: "Create a Roblox map using Parts and scripts. Explain how to build it and provide complete code where practical.",
        ui: "Create a Roblox UI with appropriate LocalScripts, server communication when needed, and clear placement instructions.",
        effects: "Create Roblox visual effects, particles, trails, and sounds with complete setup instructions.",
        gameplay: "Create a complete Roblox gameplay system with secure server-side logic and any required client scripts."
    };

    const prompt = `
You are an expert Roblox Luau developer helping a beginner
who uses Studio Lite on mobile.

TASK TYPE: ${instructions[type]}

USER IDEA:
${idea}

Requirements:
- Use Roblox Luau, not JavaScript, for Roblox scripts.
- Give complete copyable scripts.
- State exactly where every script belongs.
- List required Parts, Models, RemoteEvents, and other objects.
- Keep script names consistent.
- Explain how to test the result.
- Never claim you have directly changed the user's game.
- Never invent asset IDs or claim an asset was published.
- If a feature cannot be completed using scripts alone,
  explain the extra steps or tools required.
- For large games, provide a working first version and
  identify what should be added next.
`;

    let lastError = "No model returned a result.";

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

            if (response.ok) {
                const output = data.candidates?.[0]?.content?.parts
                    ?.map(part => part.text || "")
                    .join("");

                if (output) {
                    console.log("Working model:", model.name);
                    return output;
                }

                lastError = "Gemini returned no text.";
                continue;
            }

            lastError =
                data.error?.message || `HTTP ${response.status}`;

            console.error(model.name, response.status, lastError);

            if (
                response.status === 404 ||
                response.status === 429 ||
                response.status >= 500
            ) {
                continue;
            }

            throw new Error(lastError);
        } catch (error) {
            lastError = error.message;
            console.error("Model attempt failed:", lastError);
        }
    }

    throw new Error(lastError);
}

// Website generator. Never put API keys in public website code.
app.post("/website-generate", async (req, res) => {
    if (!checkLimit(req)) {
        return res.status(429).json({
            error: "Too many requests. Wait one minute and try again."
        });
    }

    const { type, idea } = req.body || {};
    const allowedTypes = [
        "game", "animation", "map", "ui", "effects", "gameplay"
    ];

    if (
        !allowedTypes.includes(type) ||
        typeof idea !== "string" ||
        !idea.trim() ||
        idea.length > 1200
    ) {
        return res.status(400).json({
            error: "Choose a creation type and enter an idea of 1-1200 characters."
        });
    }

    try {
        const gamePlan = await generateWithGemini(type, idea.trim());
        return res.json({ success: true, gamePlan });
    } catch (error) {
        console.error("Website generation failed:", error.message);
        return res.status(502).json({
            error: "Generation failed. Check Render logs."
        });
    }
});

// Keep the protected endpoint for your existing Roblox integration.
app.post("/generate-game", async (req, res) => {
    if (
        !process.env.ROBLOX_SECRET ||
        req.get("x-roblox-secret") !== process.env.ROBLOX_SECRET
    ) {
        return res.status(401).json({ error: "Unauthorized." });
    }

    const { idea } = req.body || {};

    if (typeof idea !== "string" || !idea.trim() || idea.length > 1200) {
        return res.status(400).json({ error: "Invalid game idea." });
    }

    try {
        const gamePlan = await generateWithGemini("game", idea.trim());
        return res.json({ success: true, gamePlan });
    } catch (error) {
        console.error("Roblox generation failed:", error.message);
        return res.status(502).json({
            error: "Generation failed. Check Render logs."
        });
    }
});

const port = process.env.PORT || 3000;

app.listen(port, "0.0.0.0", () => {
    console.log("Roblox AI Game Builder backend loaded!");
});
