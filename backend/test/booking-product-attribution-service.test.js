const test = require('node:test');
const assert = require('node:assert/strict');

const { productEvidence } = require('../src/services/bookingProductAttributionService');

test('productEvidence reads actual video products and distinguishes unavailable data', () => {
  const evidence = productEvidence({
    snapshot_product_id: 'product-1',
    raw_metrics: {
      list: { products: [{ id: 'product-2' }] },
    },
  });
  assert.equal(evidence.available, true);
  assert.deepEqual([...evidence.productIds], ['product-1', 'product-2']);

  const emptyEvidence = productEvidence({ raw_metrics: { list: { products: [] } } });
  assert.equal(emptyEvidence.available, true);
  assert.deepEqual([...emptyEvidence.productIds], []);

  assert.equal(productEvidence({ raw_metrics: {} }).available, false);
});
