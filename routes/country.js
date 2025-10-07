const { Router } = require("express");

const router = Router();

const countryController = require("../controllers/country");
const middleware = require("../middlewares/auth");

router.get("/countries", middleware.auth, countryController.countries);

module.exports = router;