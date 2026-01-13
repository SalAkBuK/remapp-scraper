require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeDetails() {
    const email = process.env.REMAPP_EMAIL;
    const password = process.env.REMAPP_PASSWORD;

    if (!email || !password) {
        console.error('Error: REMAPP_EMAIL and REMAPP_PASSWORD must be set in .env file');
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto('https://offplan.remapp.ae/auth/login');
        await page.fill('#form_item_email', email);
        await page.fill('#form_item_password', password);
        await Promise.all([
            page.waitForURL('**/off-plan-project**', { timeout: 30000 }),
            page.click('.ant-btn.ant-btn-primary')
        ]);

        if (page.url() !== 'https://offplan.remapp.ae/off-plan-project') {
            await page.goto('https://offplan.remapp.ae/off-plan-project');
        }

        await page.waitForSelector('.card-container:not(.skeleton)', { timeout: 30000 });
        await page.waitForTimeout(2000);

        // Click the first card
        console.log('Clicking the first project card...');
        await Promise.all([
            page.waitForLoadState('networkidle'),
            page.click('.card-container:not(.skeleton) >> nth=0')
        ]);

        console.log('Navigated to details. Extracting data...');

        // Wait for key elements
        await page.waitForSelector('.main_section', { timeout: 10000 }).catch(() => console.log('Main section not found immediately'));

        const details = await page.evaluate(() => {
            const data = {};

            // 1. Basic Info
            // Try to find the project title. It's usually a large header.
            // In the list view it was .card-title. On this page, let's check headers.
            const projectTitle = Array.from(document.querySelectorAll('h1, h2, h3, .title'))
                .find(el => el.innerText.includes('Amra') || el.innerText.trim().length > 0 && !el.innerText.includes('Off Plan'));
            data.title = projectTitle ? projectTitle.innerText.trim() : document.title;

            // 2. Amenities
            const amenitiesHeader = Array.from(document.querySelectorAll('h3, h4, h5')).find(h => h.innerText.toLowerCase().includes('facilities & amenities'));
            if (amenitiesHeader) {
                const section = amenitiesHeader.closest('section') || amenitiesHeader.parentElement.parentElement;
                if (section) {
                    const images = Array.from(section.querySelectorAll('img'));
                    // Prefer alt text if specific, else src
                    data.amenities = images.map(img => {
                        const alt = img.alt;
                        if (alt && alt.length > 5 && !alt.includes('unit image')) return alt;
                        return img.src; // Fallback to URL
                    });
                }
            }

            // 3. Payment Plan
            const paymentHeader = Array.from(document.querySelectorAll('h3')).find(h => h.innerText.toLowerCase().includes('payment plan'));
            if (paymentHeader) {
                const paymentSection = paymentHeader.closest('.section_payment_plans') || paymentHeader.parentElement.parentElement;
                if (paymentSection) {
                    data.payment_plan = Array.from(paymentSection.querySelectorAll('.condition-list li')).map(li => {
                        const label = li.querySelector('.condition-label')?.innerText;
                        const value = li.querySelector('.condition-value')?.innerText;
                        return `${label}: ${value}`;
                    });

                    data.payment_plan_tabs = Array.from(paymentSection.querySelectorAll('.swiper-slide span')).map(s => s.innerText);
                }
            }

            // 4. Description
            const descEl = document.querySelector('.product-single-description');
            if (descEl) {
                data.description = descEl.innerText.trim();
            } else {
                // Fallback to Building header
                const buildingHeader = Array.from(document.querySelectorAll('h3, h4, h5')).find(h => h.innerText.trim() === 'Building');
                if (buildingHeader) {
                    const nextEl = buildingHeader.nextElementSibling;
                    if (nextEl && nextEl.innerText.trim().length > 5) {
                        data.description = nextEl.innerText.trim();
                    } else {
                        // Check for any large paragraph in the main section
                        const paragraphs = Array.from(document.querySelectorAll('.main_section p'));
                        const longestP = paragraphs.reduce((a, b) => a.innerText.length > b.innerText.length ? a : b, { innerText: '' });
                        if (longestP.innerText.length > 50) data.description = longestP.innerText.trim();
                    }
                }
            }

            // 5. Developer (Try to find "By [Name]")
            // Or look for an image that looks like a logo in a sidebar or header
            // This is harder without specific selector. 

            return data;
        });

        console.log('Extracted Details:', details);
        fs.writeFileSync('single_project_detail.json', JSON.stringify(details, null, 2));

    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await browser.close();
    }
}

scrapeDetails();
