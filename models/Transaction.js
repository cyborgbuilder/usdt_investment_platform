const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  txHash: { type: String, required: true },
  type: { type: String, enum: ["deposit", "withdraw", "roi", "investment"], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ["pending", "confirmed", "failed"], default: "confirmed" },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Transaction", TransactionSchema);
