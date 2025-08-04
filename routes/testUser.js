const express = require("express");
const User = require("../models/User");
const router = express.Router();

router.post("/create-test-user", async (req, res) => {
  try {
    const user = new User({ username: "testuser" });
    await user.save();
    res.json({ message: "User created", user });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
