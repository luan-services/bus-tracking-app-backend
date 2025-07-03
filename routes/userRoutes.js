import express from "express";
import { loginUser, registerUser } from "../controllers/userController.js";
import { rateLimitHandler } from "../middleware/rateLimitHandler.js";

const router = express.Router();

router.post("/register", rateLimitHandler(10 * 60 * 1000, 5), registerUser);

router.post("/login", rateLimitHandler(10 * 60 * 1000, 5), loginUser);

export default router;