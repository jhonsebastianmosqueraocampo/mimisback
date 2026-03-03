const { Router } = require("express");
const router = Router();
const middleware = require("../middlewares/auth");
const funFactController = require("../controllers/funFact.js");

router.post("/create", middleware.auth, funFactController.createFunFact);

router.get("/list", middleware.auth, funFactController.getFunFacts);

module.exports = router;
