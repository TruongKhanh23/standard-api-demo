const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/auth.controller");

router.post("/token", ctrl.getToken);

module.exports = router;