const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: String,
  balance: { type: Number, default: 0 },
  depositAddress: String,
  privateKey: String, 
  depositPrivateKey: { type: String },
});

module.exports = mongoose.model("User", UserSchema);
