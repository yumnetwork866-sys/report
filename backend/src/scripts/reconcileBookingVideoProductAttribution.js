require('dotenv').config();

const { sequelize } = require('../models');
const { reconcileBookingVideoProductAttribution } = require('../services/bookingProductAttributionService');

const apply = process.argv.includes('--apply');

const main = async () => {
  const result = await reconcileBookingVideoProductAttribution({ apply });
  console.log(JSON.stringify(result, null, 2));
  if (!apply) console.log('Dry run only. Re-run with --apply to persist verified attribution.');
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
