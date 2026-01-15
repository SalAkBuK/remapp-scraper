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

const listPath = path.join(__dirname, 'dist', 'projects_from_api.json');
const detailsPath = path.join(__dirname, 'dist', 'projects_details_by_fk.json');
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
        const data = readJsonFile(listPath);
        const stats = getFileStats(listPath);
        return { data, stats, source: 'dist/projects_from_api.json' };
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
            details: 'dist/projects_from_api.json and projects.json.bak could not be read'
        });
        return;
    }

    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const perPage = Math.max(parseInt(req.query.per_page || '20', 10), 1);
    const total = Array.isArray(result.data) ? result.data.length : 0;
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const pageData = Array.isArray(result.data) ? result.data.slice(start, end) : [];

    const ageMs = Date.now() - result.stats.mtimeMs;
    const ageHours = Math.round((ageMs / (60 * 60 * 1000)) * 10) / 10;

    res.json({
        source: result.source,
        lastUpdated: new Date(result.stats.mtimeMs).toISOString(),
        ageHours,
        isStale: ageMs > cacheTtlMs,
        count: total,
        page,
        per_page: perPage,
        total,
        data: pageData
    });
});

app.get('/projects/:id', requireApiKey, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }

    try {
        const details = readJsonFile(detailsPath);
        const detail = details && details[id];
        if (!detail) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.json(detail);
    } catch (error) {
        res.status(503).json({
            error: 'Details unavailable',
            details: 'dist/projects_details_by_fk.json could not be read'
        });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`API listening on port ${port}`);
});
