const cron = require("node-cron");
const Investment = require("../models/Investment");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

const MS_PER_DAY = 24 * 60 * 60 * 1000; // ms in a day

function startReturnJob() {
  cron.schedule("5 * * * * *", async () => {
    console.log("⏰ Running per-minute ROI job...");

    try {
      const now = new Date();

      // Pull only active investments
      const activeInvestments = await Investment.find({ status: "active" })
        .select("_id userId amount dailyRate roi lastReturnDate startDate createdAt")
        .lean();

      for (const inv of activeInvestments) {
        try {
          const user = await User.findById(inv.userId).select("_id");
          if (!user) continue;

          const baseline = inv.lastReturnDate || inv.startDate || inv.createdAt || now;
          const elapsedMs = now - new Date(baseline);

          if (elapsedMs <= 0) {
            // Just move cursor forward if no time passed
            await Investment.updateOne(
              { _id: inv._id, status: "active" },
              { $set: { lastReturnDate: now } }
            );
            continue;
          }

          // Fractional ROI for elapsed time
          const amount = Number(inv.amount);
          const dailyRate = Number(inv.dailyRate || 0.01); // fallback to 1% daily
          const fractionOfDay = elapsedMs / MS_PER_DAY;
          const roiInc = amount * dailyRate * fractionOfDay;

          if (roiInc <= 0) {
            await Investment.updateOne(
              { _id: inv._id, status: "active" },
              { $set: { lastReturnDate: now } }
            );
            continue;
          }

          // Atomic update to Investment and move lastReturnDate
          const res = await Investment.updateOne(
            { _id: inv._id, status: "active", lastReturnDate: inv.lastReturnDate || inv.startDate || inv.createdAt },
            { $inc: { roi: roiInc }, $set: { lastReturnDate: now } }
          );

          if (res.modifiedCount === 1) {
            // Also log transaction for history
            await Transaction.create({
              userId: user._id,
              txHash: `internal_roi_${Date.now()}`,
              type: "roi",
              amount: roiInc,
              status: "confirmed",
              timestamp: now
            });

            console.log(`✅ ROI +${roiInc.toFixed(8)} for user ${user._id}`);
          } else {
            console.log(`⏭️ Skipped ${inv._id}: lastReturnDate already updated by another worker`);
          }
        } catch (perInvErr) {
          console.error(`❌ Error processing investment ${inv._id}:`, perInvErr);
        }
      }

      console.log("✅ Per-minute ROI job completed");
    } catch (error) {
      console.error("❌ Error in ROI job:", error);
    }
  });
}

module.exports = startReturnJob;
