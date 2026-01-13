const fs = require('fs');

const html = fs.readFileSync('detail_page.html', 'utf8').toLowerCase();

const keywords = ['Amra', 'product-single-description', 'developer', 'amenities'];

keywords.forEach(keyword => {
    const index = html.indexOf(keyword.toLowerCase());
    if (index !== -1) {
        console.log(`\n--- Found "${keyword}" at index ${index} ---`);
        const start = Math.max(0, index - 500);
        const end = Math.min(html.length, index + 500);
        console.log(html.substring(start, end));
    } else {
        console.log(`\n--- "${keyword}" NOT FOUND ---`);
    }
});
