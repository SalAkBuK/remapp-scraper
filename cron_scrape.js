require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { scrape } = require('./scrape');

const dataPath = path.join(__dirname, 'projects.json');
const backupPath = path.join(__dirname, 'projects.json.bak');

function safeCopy(src, dest) {
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
    }
}

function isValidJsonFile(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        JSON.parse(raw);
        return true;
    } catch (error) {
        return false;
    }
}

async function run() {
    process.env.HEADLESS = 'true';

    safeCopy(dataPath, backupPath);

    await scrape();

    if (!isValidJsonFile(dataPath)) {
        console.error('New projects.json is invalid. Restoring backup.');
        safeCopy(backupPath, dataPath);
        process.exitCode = 1;
        return;
    }

    console.log('Cron scrape completed successfully.');
}

run().catch((error) => {
    console.error('Cron scrape failed:', error);
    process.exitCode = 1;
});
