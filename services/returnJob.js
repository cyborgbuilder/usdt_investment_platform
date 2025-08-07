const cron = require("node-cron");
const Investment = require("../models/Investment");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

function startReturnJob() {
  cron.schedule("* * * * *", async () => {
    try {
      const activeInvestments = await Investment.find({ status: "active" });

      for (const inv of activeInvestments) {
        const user = await User.findById(inv.userId);
        if (!user) continue;

        const dailyReturn = inv.amount * 0.01; // 1% daily return

        // 💡 ROI is now tracked via transactions, not added to balance
        await Transaction.create({
          userId: user._id,
          txHash: `internal_roi_${Date.now()}`,
          type: "roi",
          amount: dailyReturn,
          status: "confirmed",
          timestamp: new Date()
        });

        console.log(`✅ ROI ${dailyReturn} generated for user ${user._id}`);
      }
    } catch (error) {
      console.error("❌ Error in ROI Job:", error.message);
    }
  });
}

module.exports = startReturnJob;
