const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/policy.controller");
const { auth } = require("../middleware/auth.middleware");
const { idempotency } = require("../middleware/idempotency.middleware");

router.get("/", auth("policy.read"), ctrl.getAll);
router.get("/:id", auth("policy.read"), ctrl.getById);
router.post("/", auth("policy.write"), ctrl.create);
router.put("/:id", auth("policy.write"), ctrl.update);
router.patch("/:id", auth("policy.write"), ctrl.patch);
router.delete("/:id", auth("policy.write"), ctrl.delete);

router.post("/:id/top-up", idempotency, auth("policy.write"), ctrl.topUp);

router.post("/:id/deactivate", auth("policy.write"), ctrl.deactivate);

module.exports = router;
