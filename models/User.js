const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-zA-Z0-9_]+$/,
    },
    email: {
      type: String,
      required: false,
      unique: true,
      trim: true,
      minlength: 5,
      maxlength: 100,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: {
      type: String,
      required: true,
      minlength: 60, // bcrypt hash length
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    twoFactorAuth: {
      isEnabled: {
        type: Boolean,
        default: false,
      },
      secret: {
        type: String,
        default: null,
      },
      backupCodes: {
        type: [String],
        default: [],
      },
    },
    balance: { type: Number, default: 0 },
    depositAddress: String,
    privateKey: String,
    depositPrivateKey: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for better performance
UserSchema.index({ createdAt: -1 });
UserSchema.index({ role: 1 });

// Static method to find user by username
UserSchema.statics.findByUsername = function (username) {
  return this.findOne({ username });
};

module.exports = mongoose.model("User", UserSchema);
