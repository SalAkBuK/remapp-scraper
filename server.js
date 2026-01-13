const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const API_KEY = process.env.API_KEY; // set in cPanel env vars

function requireApiKey(req, res, next) {
    if (!API_KEY) {
        return res.status(500).json({ error: "API_KEY not configured on server" });
    }
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

const dataPath = path.join(__dirname, 'projects.json');
const backupPath = path.join(__dirname, 'projects.json.bak');
const cacheTtlMs = 24 * 60 * 60 * 1000;

function readJsonFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
}

function getFileStats(filePath) {
    const stats = fs.statSync(filePath);
    return {
        mtimeMs: stats.mtimeMs
    };
}

function loadProjects() {
    try {
        const data = readJsonFile(dataPath);
        const stats = getFileStats(dataPath);
        return { data, stats, source: 'projects.json' };
    } catch (error) {
        try {
            const data = readJsonFile(backupPath);
            const stats = getFileStats(backupPath);
            return { data, stats, source: 'projects.json.bak' };
        } catch (backupError) {
            return { error: error, backupError: backupError };
        }
    }
}

app.get('/projects', requireApiKey, (req, res) => {
    const result = loadProjects();

    if (result.error) {
        res.status(503).json({
            error: 'Cached data unavailable',
            details: 'projects.json and projects.json.bak could not be read'
        });
        return;
    }

    const ageMs = Date.now() - result.stats.mtimeMs;
    const ageHours = Math.round((ageMs / (60 * 60 * 1000)) * 10) / 10;

    res.json({
        source: result.source,
        lastUpdated: new Date(result.stats.mtimeMs).toISOString(),
        ageHours,
        isStale: ageMs > cacheTtlMs,
        count: Array.isArray(result.data) ? result.data.length : null,
        data: result.data
    });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`API listening on port ${port}`);
});
