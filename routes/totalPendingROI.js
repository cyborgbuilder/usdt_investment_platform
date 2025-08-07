// const express = require("express");
// const router = express.Router();
// const Investment = require("../models/Investment");


// router.get("/:userId", async (req, res) => {
//   try {
//     const investments = await Investment.find({ 
//       userId: req.params.userId, 
//       status: "active" 
//     });

//     const totalPendingROI = investments.reduce((sum, inv) => sum + inv.pendingROI, 0);

//     res.json({ 
//       userId: req.params.userId,
//       totalPendingROI 
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Server Error");
//   }
// });

// module.exports = router;
