const { Router } = require("express");

const router = Router();

const apiFootballController = require("../controllers/apiFootballController.js");
const middleware = require("../middlewares/auth");

router.get("/apiCalls", middleware.auth, apiFootballController.apiCalls);

module.exports = router;