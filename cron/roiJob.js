const cron = require('node-cron');
const investmentService = require('../services/investmentService');

cron.schedule('0 0 * * *', async () => {
  console.log('Running daily ROI calculation...');
  await investmentService.calculateDailyROI();
});
