const { ethers } = require("ethers");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
require("dotenv").config();

const abi = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const TOKEN_DECIMALS = Number(process.env.TOKEN_DECIMALS || 18);
const MANAGEMENT_WALLET_ADDRESS = (process.env.MANAGEMENT_WALLET_ADDRESS || "").toLowerCase();

let provider;
let contract;
let reconnectTimer = null;

function formatAmount(valueBn) {
  return Number(ethers.formatUnits(valueBn, TOKEN_DECIMALS));
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startListener(); // re-boot
  }, 5000);
}

function startListener() {
  const wsUrl = `wss://sepolia.infura.io/ws/v3/${process.env.ALCHEMY_URL}`;

  try {
    console.log("🔌 Connecting to Infura WebSocket...");
    provider = new ethers.WebSocketProvider(wsUrl);
    contract  = new ethers.Contract(process.env.USDT_CONTRACT, abi, provider);

    console.log("✅ Deposit listener started. Waiting for events...");

    // Try to hook underlying websocket if available (ethers v6 does not expose provider.on('close'))
    const ws = provider._websocket || provider.websocket || provider._ws;
    if (ws && typeof ws.on === "function") {
      ws.on("close", (code) => {
        console.warn("🛑 WS closed:", code, "→ reconnecting in 5s");
        try { ws.terminate?.(); } catch {}
        scheduleReconnect();
      });
      ws.on("error", (e) => {
        console.error("⚠️ WS error:", e?.message || e);
        scheduleReconnect();
      });
    }

    contract.on("Transfer", async (from, to, value, event) => {
      try {
        const txHash = event?.log?.transactionHash || event?.transactionHash;
        const amount = formatAmount(value);
        if (!txHash || amount <= 0) return;

        // find user by deposit address (case-insensitive)
        const toLc = (to || "").toLowerCase();
        const user = await User.findOne({ depositAddress: new RegExp(`^${toLc}$`, "i") })
                               .select("_id depositBalance balance username");
        if (!user) return;

        const fromLc = (from || "").toLowerCase();
        const isFromManagement = MANAGEMENT_WALLET_ADDRESS && fromLc === MANAGEMENT_WALLET_ADDRESS;

        // 🚫 NEW RULE: if deposit comes from the management wallet, do NOT save or credit
        if (isFromManagement) {
          console.log(`⏭️ Skipping management-origin transfer ${txHash} → user ${user._id}`);
          return;
        }

        // Keep existing type if a route already wrote this tx (e.g., 'disinvest' / 'claim-roi')
        const existing = await Transaction.findOne({ txHash }).select("type").lean();
        const defaultType = "deposit"; // unchanged for non-management flows
        const finalType = existing?.type || defaultType;

        // Upsert by txHash to ensure idempotency
        const up = await Transaction.updateOne(
          { txHash },
          {
            $setOnInsert: {
              userId: user._id,
              type: finalType,
              amount,
              status: "confirmed",
              timestamp: new Date()
            }
          },
          { upsert: true }
        );

        if (up.upsertedCount === 1) {
          const balanceField = typeof user.depositBalance === "number" ? "depositBalance" : "balance";
          await User.updateOne({ _id: user._id }, { $inc: { [balanceField]: amount } });
          console.log(`💸 +${amount} (${finalType}) → ${balanceField} for user ${user._id} | tx ${txHash}`);
        } else {
          // already processed elsewhere — no double credit
        }
      } catch (err) {
        console.error("❌ Error processing transfer:", err);
      }
    });
  } catch (error) {
    console.error("❌ Failed to start deposit monitor:", error);
    scheduleReconnect();
  }
}

module.exports = startListener;
