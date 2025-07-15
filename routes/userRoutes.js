import express from "express";
import { loginUser, registerUser, refreshToken, logoutUser, getCurrentUser } from "../controllers/userController.js";
import { rateLimitHandler } from "../middleware/rateLimitHandler.js";
// importa middleware de validação pois o route /me é privado precisa saber quem está logado.
import { validateJwtToken } from "../middleware/validateTokenHandler.js";

const router = express.Router();


router.get("/me", validateJwtToken, getCurrentUser);

router.post("/register", rateLimitHandler(10 * 60 * 1000, 5), registerUser);

router.post("/login", rateLimitHandler(10 * 60 * 1000, 5), loginUser);

router.post("/refresh", rateLimitHandler(10 * 60 * 1000, 5), refreshToken);

// route para logout
router.post("/logout", rateLimitHandler(10 * 60 * 1000, 5), logoutUser);

export default router;