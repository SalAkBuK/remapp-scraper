require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');

async function scrape() {
    const email = process.env.REMAPP_EMAIL;
    const password = process.env.REMAPP_PASSWORD;
    const headless = process.env.HEADLESS === 'true';

    if (!email || !password) {
        console.error('Error: REMAPP_EMAIL and REMAPP_PASSWORD must be set in .env file');
        process.exit(1);
    }

    console.log('Launching browser...');
    const browser = await chromium.launch({ headless }); // Set HEADLESS=true for cron runs
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('Navigating to login page...');
        await page.goto('https://offplan.remapp.ae/auth/login');

        console.log('Logging in...');
        await page.fill('#form_item_email', email);
        await page.fill('#form_item_password', password);

        // Wait for navigation after clicking submit
        await Promise.all([
            page.waitForURL('**/off-plan-project**', { timeout: 30000 }), // Expect redirect to off-plan-project
            page.click('.ant-btn.ant-btn-primary')
        ]);

        console.log('Login successful! navigating to off-plan projects...');

        // Ensure we are on the right page
        if (page.url() !== 'https://offplan.remapp.ae/off-plan-project') {
            await page.goto('https://offplan.remapp.ae/off-plan-project');
        }

        console.log('Waiting for project list to load...');
        // Wait for cards that are NOT skeletons
        await page.waitForSelector('.card-container:not(.skeleton)', { timeout: 30000 });
        // Give it a bit more time to settle just in case
        await page.waitForTimeout(2000);

        console.log('Starting infinite scroll...');
        let previousHeight = 0;
        let scrollAttempts = 0;
        const maxAttempts = 5; // Stop after 5 attempts with no height change

        while (scrollAttempts < maxAttempts) {
            const currentHeight = await page.evaluate(() => {
                const container = document.querySelector('.scrollable-cards');
                if (!container) return 0;
                container.scrollTo(0, container.scrollHeight);
                return container.scrollHeight;
            });

            if (currentHeight === previousHeight) {
                scrollAttempts++;
                console.log(`Scroll attempt ${scrollAttempts}/${maxAttempts} - No new content loaded.`);
            } else {
                scrollAttempts = 0; // Reset attempts if we found new content
                previousHeight = currentHeight;
                console.log(`Scrolled to height: ${currentHeight}`);

                // Get current count for feedback
                const count = await page.$$eval('.card-container:not(.skeleton)', els => els.length);
                console.log(`Current project count: ${count}`);
            }

            // Wait for network and DOM to settle
            await page.waitForTimeout(2000);
        }

        console.log('Finished scrolling. Extracting data...');

        const projects = (await page.$$eval('.card-container', (cards) => {
            return cards.map(card => {
                if (card.classList.contains('skeleton')) {
                    return null;
                }
                const title = card.querySelector('.card-title')?.textContent.trim();
                const district = card.querySelector('.card-district')?.textContent.trim();
                const priceHeader = card.querySelector('.price_section h6');
                const price = priceHeader ? priceHeader.textContent.trim() : null;
                const imageEl = card.querySelector('.card-image');
                let image = null;
                if (imageEl) {
                    image = imageEl.getAttribute('data-src') ||
                        imageEl.getAttribute('data-lazy') ||
                        imageEl.getAttribute('data-original') ||
                        imageEl.src ||
                        imageEl.getAttribute('src');
                    if (image && image.startsWith('data:image/')) {
                        image = imageEl.getAttribute('data-src') ||
                            imageEl.getAttribute('data-lazy') ||
                            imageEl.getAttribute('data-original') ||
                            null;
                    }
                }

                // Get handover date - usually the last paragraph in the content
                const paragraphs = Array.from(card.querySelectorAll('.card-content p'));
                const handover = paragraphs.length > 0 ? paragraphs[paragraphs.length - 1].textContent.trim() : null;

                return {
                    title,
                    district,
                    price,
                    image,
                    handover,
                    debug_html: !title ? card.outerHTML : null // Return HTML if title is missing for debugging
                };
            });
        })).filter(Boolean);

        console.log(`Extracted ${projects.length} projects.`);
        fs.writeFileSync('projects.json', JSON.stringify(projects, null, 2));
        console.log('Data saved to projects.json');

        await page.screenshot({ path: 'final_screenshot.png' });

        // FUTURE: Add extraction logic here once structure is known

    } catch (error) {
        console.error('An error occurred:', error);
        await page.screenshot({ path: 'error_screenshot.png' });
        throw error;
    } finally {
        await browser.close();
    }
}

if (require.main === module) {
    scrape().catch(() => {
        process.exitCode = 1;
    });
}

module.exports = { scrape };
