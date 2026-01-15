/**
 * parsers.js
 * Helpers for parsing various data types for project normalization.
 */

/**
 * Normalizes text by removing extra whitespace.
 * @param {string} text 
 * @returns {string|null}
 */
const clean = (text) => text ? text.replace(/\s+/g, ' ').trim() : null;

/**
 * Parses money strings like "690.0K AED", "1,100,000 AED", "From 690,000 AED".
 * @param {string} str 
 * @returns {{ amount: number|null, currency: string|null }}
 */
function parseMoney(str) {
  if (!str) return { amount: null, currency: null };

  // Normalize string: "From 690.0K AED" -> "690.0K AED"
  let cleanStr = str.replace(/from/i, '').trim();

  // Extract currency (AED is default if typically found in context, but let's try to find it)
  // Heuristic: Last word or first word matching AED|USD
  const currencyMatch = cleanStr.match(/(AED|USD)/i);
  const currency = currencyMatch ? currencyMatch[0].toUpperCase() : 'AED'; // Default to AED per spec if ambiguous/missing? Spec says "if currency absent assume AED" for payment plan, good default.

  // Remove currency and commas
  let numberPart = cleanStr.replace(/(AED|USD|,)/ig, '').trim();

  let multiplier = 1;
  if (numberPart.toUpperCase().endsWith('K')) {
    multiplier = 1000;
    numberPart = numberPart.slice(0, -1);
  } else if (numberPart.toUpperCase().endsWith('M')) {
    multiplier = 1000000;
    numberPart = numberPart.slice(0, -1);
  }

  const val = parseFloat(numberPart);
  if (isNaN(val)) return { amount: null, currency: null };

  return {
    amount: Math.round(val * multiplier),
    currency: currency
  };
}

/**
 * Parses date strings like "Completion: 2028-12-31" or "2028-12-31".
 * @param {string} str 
 * @returns {string|null} ISO date string YYYY-MM-DD
 */
function parseDate(str) {
  if (!str) return null;
  // Look for YYYY-MM-DD pattern
  const match = str.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Parses Unit Types from the "All Units" text block.
 * Expected format blocks:
 * "STUDIO ... from 690,000 AED"
 * "1 BEDROOM ... from 1,100,000 AED"
 * Also supports "FROM AED 690K"
 * @param {string} sectionText 
 * @returns {Array<{ unit_type_label: string, beds: number|null, price_from: { amount: number|null, currency: string } }>}
 */
function parseUnitTypes(sectionText) {
  if (!sectionText) return [];

  const results = [];

  // Regex strategy updated to handle "from X AED" or "from AED X"
  // Match "from" followed by currency+number or number+currency
  // Helper regex part for price: (?:AED\s*[\d,.]+[KMB]?|[\d,.]+[KMB]?\s*AED)
  const pricePattern = /(?:AED\s*[\d,.]+[KMB]?|[\d,.]+[KMB]?\s*AED)/.source;

  // 1. Studio
  // Match STUDIO ... from ... price
  const studioRegex = new RegExp(`STUDIO[\\s\\S]*?from\\s+(${pricePattern})`, 'i');
  const studioMatch = sectionText.match(studioRegex);
  if (studioMatch) {
    results.push({
      unit_type_label: 'STUDIO',
      beds: 0,
      price_from: parseMoney(studioMatch[1])
    });
  }

  // 2. Bedrooms (1-9)
  // Match 1 BEDROOM ... from ... price
  const bedRegex = new RegExp(`(\\d)\\s*BEDROOM?[\\s\\S]*?from\\s+(${pricePattern})`, 'gi');
  const bedMatches = sectionText.matchAll(bedRegex);
  for (const match of bedMatches) {
    results.push({
      unit_type_label: `${match[1]} BEDROOM`,
      beds: parseInt(match[1], 10),
      price_from: parseMoney(match[2])
    });
  }

  // Fallback/Optimization:
  // If the above explicit named matches fail, check for generic "Apartments X Bedroom" pattern found in direct details
  // "Apartments 2 Bedroom FROM AED 1.6M"
  if (results.length === 0) {
    // Studio fallback
    const altStudioRaw = sectionText.match(/Apartments\s+Studio\s+FROM\s+([^\s]+(?:K|M|AED|\s)+)/i);
    if (altStudioRaw && !results.find(r => r.unit_type_label === 'STUDIO')) {
      results.push({
        unit_type_label: 'STUDIO',
        beds: 0,
        price_from: parseMoney(altStudioRaw[1])
      });
    }

    // Bedrooms fallback
    const altBedMatches = sectionText.matchAll(/Apartments\s+(\d)\s+Bedroom\s+FROM\s+([^\s]+(?:K|M|AED|\s)+)/gi);
    for (const match of altBedMatches) {
      const label = `${match[1]} BEDROOM`;
      if (!results.find(r => r.unit_type_label === label)) {
        results.push({
          unit_type_label: label,
          beds: parseInt(match[1], 10),
          price_from: parseMoney(match[2])
        });
      }
    }
  }

  return results;
}

/**
 * Parses Nearby Places from text.
 * Expected format: "Mini Maldives 0.6 KM"
 * @param {string} sectionText 
 * @returns {Array<{ name: string, distance_km: number }>}
 */
function parseNearbyPlaces(sectionText) {
  if (!sectionText) return [];

  const results = [];
  // Regex: Scan for "Name Distance KM"
  // Name can be multiple words. Distance is number + KM.
  // Stratergy: Split by lines, check if line ends in KM

  const lines = sectionText.split(/\r?\n|Show less|Location|Nearby Places/);

  lines.forEach(line => {
    const cleanLine = clean(line);
    if (!cleanLine) return;

    // Match "Name 12.3 KM"
    const match = cleanLine.match(/^(.*)\s+(\d+(\.\d+)?)\s*KM$/i);
    if (match) {
      results.push({
        name: match[1].trim(),
        distance_km: parseFloat(match[2])
      });
    }
  });

  return results;
}

/**
 * Parses Amenities from text.
 * @param {string} sectionText 
 * @returns {Array<string>}
 */
function parseAmenities(sectionText) {
  if (!sectionText) return [];

  const results = [];
  // The text might be flattened from scraper, so newlines are gone.
  // However, the text often contains "Visualisation from developer" interleaved.
  // "Gym Visualisation from developer Spa Visualisation from developer"

  // Split by newlines OR the specific phrases found in this source
  // Also "Facilities & Amenities" might start it.

  // 1. Remove "Facilities & Amenities" or "Facilities" prefix
  let content = sectionText.replace(/Facilities\s*(&\s*Amenities)?/i, '').trim();

  // 2. Split by "Visualisation from developer"
  const parts = content.split(/Visualisation from developer/i);

  parts.forEach(part => {
    const t = clean(part);
    if (!t) return;

    // Filter out unlikely things (too long?)
    if (t.length > 50) {
      // Maybe it's a huge block of unmatched text? 
      // Try splitting by common delimiters if newlines exist?
      // But valid amenities can be distinct. 
      // If it's a list like "Gym, Spa, Pool", split by comma?
      // For now, accept it if it's reasonable length, or skip if it looks like description.
      return;
    }

    results.push(t);
  });

  // Dedupe
  return [...new Set(results)];
}

/**
 * Parses Payment Plan from text.
 * @param {string} sectionText 
 * @returns {Object}
 */
function parsePaymentPlan(sectionText) {
  const res = {
    name: null,
    construction_pct: null,
    post_handover_pct: null,
    post_handover_months: null,
    eoi_amount: { amount: null, currency: 'AED' },
    raw_text: clean(sectionText)
  };

  if (!sectionText) return res;

  // Name: Start of text? "3 years post handover payment plan"
  // Heuristic: First sentence or semantic match
  const nameMatch = sectionText.match(/^(.*?payment plan)/i);
  if (nameMatch) {
    res.name = clean(nameMatch[0]);
  } else {
    // Fallback: take first non-percentage line?
    res.name = clean(sectionText.split(/70%|\n/)[0]);
  }

  // Construction %
  const constrMatch = sectionText.match(/(\d+)%\s*During construction/i);
  if (constrMatch) res.construction_pct = parseInt(constrMatch[1], 10);

  // Post Handover %
  const phMatch = sectionText.match(/(\d+)%\s*Within/i) || sectionText.match(/(\d+)%\s*Post/i);
  if (phMatch) res.post_handover_pct = parseInt(phMatch[1], 10);

  // Fallback logic for PH if not explicit "Within"
  // e.g. "30% Within 36 months"

  // Months
  const monthsMatch = sectionText.match(/(\d+)\s*months/i);
  if (monthsMatch) res.post_handover_months = parseInt(monthsMatch[1], 10);

  // EOI
  const eoiMatch = sectionText.match(/EOI\s*(\d+)/i);
  if (eoiMatch) {
    res.eoi_amount = { amount: parseInt(eoiMatch[1], 10), currency: 'AED' };
  }

  return res;
}

module.exports = {
  clean,
  parseMoney,
  parseDate,
  parseUnitTypes,
  parseNearbyPlaces,
  parseAmenities,
  parsePaymentPlan
};
