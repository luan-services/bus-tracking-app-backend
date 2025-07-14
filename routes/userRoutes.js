import express from "express";
import { loginUser, registerUser, refreshToken, logoutUser } from "../controllers/userController.js";
import { rateLimitHandler } from "../middleware/rateLimitHandler.js";

const router = express.Router();

router.post("/register", rateLimitHandler(10 * 60 * 1000, 5), registerUser);

router.post("/login", rateLimitHandler(10 * 60 * 1000, 5), loginUser);

router.post("/refresh", rateLimitHandler(10 * 60 * 1000, 5), refreshToken);
// route para logout
router.post("/logout", rateLimitHandler(10 * 60 * 1000, 5), logoutUser);

export default router;