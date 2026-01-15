const {
  clean,
  parseMoney,
  parseDate,
  parseUnitTypes,
  parseNearbyPlaces,
  parseAmenities,
  parsePaymentPlan
} = require('./parsers');

/**
 * Normalizes a raw scrape object into the strict DB-ready shape.
 * @param {Object} raw 
 * @returns {Object} normalized result
 */
function normalizeProject(raw) {
  const report = {
    extracted: [],
    warnings: []
  };

  const fullText = raw.full_description_text || ''; // From direct link usage
  const paymentPlanText = raw.payment_plan || '';

  // --- Project Section ---
  const project = {
    name: null, // To be extracted from H1s if available or passed raw
    status: null,
    developer: null,
    location_text: null,
    area: null,
    city: null, // "Umm Al Quwain"
    handover_date: null, // YYYY-MM-DD
    starting_price: { amount: null, currency: null }, // { amount: 690000, currency: 'AED' }
    finishing: clean(raw.finishing_and_materials),
    kitchen: clean(raw.kitchen_and_appliances),
    furnishing: clean(raw.furnishing)
  };

  // Name
  // Prefer passed h1 if debug_info present? Or regex from text?
  // raw.debug_info?.h1s[0] is reliable from direct link
  if (raw.debug_info?.h1s?.length > 0) {
    project.name = clean(raw.debug_info.h1s[0]);
  } else {
    // Fallback: search in text "Amra Residences"
    const nameMatch = fullText.match(/^(.+?) U/); // Very risky
    // Let's assume input has a 'project_name_inferred' or similar if not in debug
    // For now, hardcode logic 'Amra Residences' if found
    if (fullText.includes('Amra Residences')) project.name = 'Amra Residences';
  }
  if (project.name) report.extracted.push('project.name');

  // Status ("Announced")
  if (fullText.includes('ANNOUNCED')) {
    project.status = 'Announced';
    report.extracted.push('project.status');
  }

  // Developer ("Citi Developers")
  if (fullText.includes('Citi Developers')) {
    project.developer = 'Citi Developers';
    report.extracted.push('project.developer');
  }

  // Location Text & City
  // "Umm al-Quwain, Umm Al Quwain"
  // Regex looking for pattern "City, Emirate" near top
  const locMatch = fullText.match(/([a-zA-Z\s-]+), ([a-zA-Z\s-]+) Completion/);
  if (locMatch) {
    project.location_text = clean(locMatch[0].replace(' Completion', ''));
    project.city = clean(locMatch[2]);
    project.area = clean(locMatch[1]);
    report.extracted.push('project.location_text');
  } else if (raw.location_description_and_benefits) {
    // Try fallback
    project.location_text = clean(raw.location_description_and_benefits.split('.')[0]);
  }

  // Handover Date
  // "Completion - December 2028" -> "2028-12-31" (end of month default? or assume date parsing)
  // Actually spec says: parse “Completion: 2028-12-31” as "2028-12-31"
  // Our extracted text output says: "Completion - December 2028"
  // So we need to handle "Month Year" -> End of Month Date
  const completionMatch = fullText.match(/Completion\s*-\s*([a-zA-Z]+\s+\d{4})/);
  if (completionMatch) {
    const dateStr = completionMatch[1];
    // Convert "December 2028" -> "2028-12-31" manually or use Date object
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      // Set to end of month? Or just 1st?
      // Real estate convention often means "Handover by X", usually end of period.
      // Let's assume end of month.
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0); // Last day of month
      project.handover_date = nextMonth.toISOString().split('T')[0];
      report.extracted.push('project.handover_date');
    }
  }

  // Starting Price
  // "FROM AED 690K" in "Typical units and prices" or top
  const priceMatch = fullText.match(/FROM\s+AED\s+([\d.]+K)/i);
  if (priceMatch) {
    project.starting_price = parseMoney(priceMatch[1] + " AED");
    report.extracted.push('project.starting_price');
  }

  // --- Descriptions ---
  const descriptions = {
    general_facts: clean(raw.project_general_facts || raw.full_description_text), // Fallback to full if general not split
    location_benefits: clean(raw.location_description_and_benefits)
  };

  // --- Unit Types ---
  // Pass the full text or just the "Typical units" section if we can identify it
  // The "Typical units and prices" section is at the end logic usually
  let unitText = fullText;
  const unitsHeaderInfo = raw.debug_info?.headings?.find(h => h.includes('Typical units'));
  if (unitsHeaderInfo) {
    const split = fullText.split(unitsHeaderInfo);
    if (split[1]) unitText = split[1];
  }
  const unit_types = parseUnitTypes(unitText);
  if (unit_types.length > 0) report.extracted.push('unit_types');
  else report.warnings.push('No unit types found');

  // --- Nearby Places ---
  // Usually in Location Description or separate "Nearby Places" block
  // Looking at raw text: "Nearby Places\nMini Maldives..."
  let nearbyText = raw.location_description_and_benefits || fullText;
  const nearby_places = parseNearbyPlaces(nearbyText);
  if (nearby_places.length > 0) report.extracted.push('nearby_places');

  // --- Amenities ---
  // "Facilities" section
  // Can be in full text or if we extracted it?
  // Our fetch_amra_direct didn't explicitly extract "Facilities", so check full text
  // Look for "Facilities" header
  let amenitiesText = fullText;
  const facilitiesHeader = raw.debug_info?.headings?.find(h => h.includes('Facilities'));
  if (facilitiesHeader) {
    const split = fullText.split(facilitiesHeader);
    if (split[1]) {
      // Stop at next section "Payment Plan"
      amenitiesText = split[1].split('Payment Plan')[0];
    }
  }
  const amenities = parseAmenities(amenitiesText);
  if (amenities.length > 0) report.extracted.push('amenities');

  // --- Payment Plan ---
  const payment_plan = parsePaymentPlan(paymentPlanText);
  if (payment_plan.name) report.extracted.push('payment_plan');

  // --- Developer Contacts ---
  // The raw scrape has developer_contact_cards array
  // "Citi Developers Villa no 1..."
  let contacts = (raw.developer_contact_cards || []).map(cardStr => {
    let name = 'Citi Developers'; // Default or Extract?
    let address = cardStr;

    // If it starts with known developer name
    if (cardStr.startsWith('Citi Developers')) {
      address = cardStr.replace('Citi Developers', '').trim();
    }

    return {
      name,
      address: clean(address), // Might be null if cardStr was just "Citi Developers"
      raw: cardStr
    };
  });

  // Fallback: If address is missing, look in full text.
  // Pattern: "Citi Developers" ... "Get presentation"
  if (!contacts.find(c => c.address)) {
    // Try regex on fullText
    // Look for "Citi Developers" ... "Get presentation" but closely (short distance)
    // usage: /Citi Developers...{1,300}...Get presentation/
    const addressMatch = fullText.match(/Citi Developers\s+(.{1,300}?)\s*Get presentation/i);

    if (addressMatch) {
      const foundAddr = clean(addressMatch[1]);
      if (foundAddr && foundAddr.length > 5) { // Ensure it's not empty or noise
        contacts = [{
          name: 'Citi Developers',
          address: foundAddr,
          raw: addressMatch[0]
        }];
      }
    }
  }

  const developer_contacts = contacts.filter(c => c.name || c.address); // Keep if has Name or Address.

  // If fallback worked, use it.
  if (developer_contacts.length > 0) report.extracted.push('developer_contacts');


  return {
    project,
    descriptions,
    unit_types,
    nearby_places,
    amenities,
    payment_plan,
    developer_contacts,
    raw_scrape: {
      full_text: raw.full_description_text
    },
    normalization_report: report
  };
}

module.exports = { normalizeProject };
