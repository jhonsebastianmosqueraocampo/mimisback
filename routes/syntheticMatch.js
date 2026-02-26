const { Router } = require("express");
const router = Router();

const syntheticMatchController = require("../controllers/syntheticMatch");
const middleware = require("../middlewares/auth");

// crear invitación
router.post("/invitation", middleware.auth, syntheticMatchController.createInvitation);

// listar todos
router.get("/", middleware.auth, syntheticMatchController.getAll);

// aprobar
router.post("/approve/:id", middleware.auth, syntheticMatchController.approve);

// rechazar
router.post("/reject/:id", middleware.auth, syntheticMatchController.reject);

// finalizar
router.post("/finish/:id",middleware.auth, syntheticMatchController.finishMatch);

module.exports = router;
