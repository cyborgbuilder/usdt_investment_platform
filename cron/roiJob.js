const cron = require('node-cron');
const mongoose = require('mongoose');
const Investment = require('../models/Investment');

mongoose.set('debug', true); // logs queries

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Run at :05 each minute
cron.schedule('5 * * * * *', async () => {
  if (process.env.RUN_ROI_WORKER !== 'true') return;

  const now = new Date();
  console.log(`\n[roi] tick @ ${now.toISOString()} pid=${process.pid} NODE_ENV=${process.env.NODE_ENV} DB=${mongoose.connection.name}`);

  const active = await Investment.find({ status: 'active' })
    .select('_id userId amount dailyRate roi lastReturnDate startDate createdAt')
    .lean();

  for (const inv of active) {
    const baseline = inv.lastReturnDate || inv.startDate || inv.createdAt || now;
    const elapsedMs = now - new Date(baseline);
    const fraction = elapsedMs / MS_PER_DAY;
    const roiInc = Number(inv.amount) * Number(inv.dailyRate) * fraction;

    console.log(`[roi] inv=${inv._id} user=${inv.userId} elapsed=${Math.round(elapsedMs/1000)}s inc=${roiInc}`);

    if (!Number.isFinite(roiInc) || roiInc <= 0) {
      const res0 = await Investment.updateOne(
        { _id: inv._id, status: 'active', lastReturnDate: inv.lastReturnDate || inv.startDate || inv.createdAt },
        { $set: { lastReturnDate: now } }
      );
      console.log(`[roi] move-cursor res=${res0.modifiedCount}`);
      continue;
    }

    const res = await Investment.updateOne(
      {
        _id: inv._id,
        status: 'active',
        lastReturnDate: inv.lastReturnDate || inv.startDate || inv.createdAt
      },
      {
        $inc: { roi: roiInc },
        $set: { lastReturnDate: now }
      }
    );

    console.log(`[roi] updateOne.modifiedCount=${res.modifiedCount}`);
  }
});
