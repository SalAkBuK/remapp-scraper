const { normalizeProject } = require('../src/normalize/normalizeProject');
const { parseMoney, parseUnitTypes, parseNearbyPlaces, parsePaymentPlan } = require('../src/normalize/parsers');

const sampleRaw = require('../amra_direct_details.json');

describe('Parsers', () => {
  test('parseMoney handles various formats', () => {
    expect(parseMoney('690.0K AED')).toEqual({ amount: 690000, currency: 'AED' });
    expect(parseMoney('From 1.1M AED')).toEqual({ amount: 1100000, currency: 'AED' });
    expect(parseMoney('25000')).toEqual({ amount: 25000, currency: 'AED' }); // Default AED
    expect(parseMoney(null)).toEqual({ amount: null, currency: null });
  });

  test('parseUnitTypes extracts studios and bedrooms', () => {
    const text = `
            All Units
            STUDIO
             Studio
             Apartments
            from 690,000 AED
            1 BEDROOM
             1BR
             Apartments
            from 1,100,000 AED
            4 BEDROOM
             4BR
             Apartments
            from 4.1M AED
        `;
    const units = parseUnitTypes(text);
    expect(units).toHaveLength(3);
    expect(units[0]).toEqual({ unit_type_label: 'STUDIO', beds: 0, price_from: { amount: 690000, currency: 'AED' } });
    expect(units[1]).toEqual({ unit_type_label: '1 BEDROOM', beds: 1, price_from: { amount: 1100000, currency: 'AED' } });
    expect(units[2]).toEqual({ unit_type_label: '4 BEDROOM', beds: 4, price_from: { amount: 4100000, currency: 'AED' } });
  });

  test('parseNearbyPlaces extracts name and distance', () => {
    const text = `
            Location Description...
            Nearby Places
            Mini Maldives 0.6 KM
            Umm Al Qura School 1.3 KM
        `;
    const places = parseNearbyPlaces(text);
    expect(places).toHaveLength(2);
    expect(places[0]).toEqual({ name: 'Mini Maldives', distance_km: 0.6 });
    expect(places[1]).toEqual({ name: 'Umm Al Qura School', distance_km: 1.3 });
  });

  test('parsePaymentPlan extracts percentages and months', () => {
    const text = "3 years post handover payment plan 70% During construction 30% Within 36 months PH EOI 25000";
    const plan = parsePaymentPlan(text);
    expect(plan.name).toContain('3 years post handover');
    expect(plan.construction_pct).toBe(70);
    expect(plan.post_handover_pct).toBe(30);
    expect(plan.post_handover_months).toBe(36);
    expect(plan.eoi_amount.amount).toBe(25000);
  });
});

describe('normalizeProject Integration', () => {
  test('normalizes Amra Residences sample correctly', () => {
    const normalized = normalizeProject(sampleRaw);

    // Assert Project Metadata
    expect(normalized.project.name).toBe('Amra Residences');
    expect(normalized.project.developer).toBe('Citi Developers');
    expect(normalized.project.status).toBe('Announced');
    expect(normalized.project.city).toBe('Umm Al Quwain'); // Based on logic
    expect(normalized.project.handover_date).toMatch(/2028-12-\d{2}/); // End of Dec 2028

    // Assert Units
    expect(normalized.unit_types.length).toBeGreaterThan(0);
    const studio = normalized.unit_types.find(u => u.unit_type_label === 'STUDIO');
    expect(studio).toBeDefined();
    expect(studio.price_from.amount).toBe(690000);

    // Assert Amenities
    expect(normalized.amenities).toContain('Salt Room');
    expect(normalized.amenities).toContain('Boxing Ring');

    // Assert Payment Plan
    expect(normalized.payment_plan.construction_pct).toBe(70);
    expect(normalized.payment_plan.post_handover_months).toBe(36);

    // Assert Developer Contacts
    expect(normalized.developer_contacts[0].name).toBe('Citi Developers');
    // Address is missing in Direct Link source, so we expect it to be null or generic
    // expect(normalized.developer_contacts[0].address).toContain('Villa no 1'); 
  });
});
