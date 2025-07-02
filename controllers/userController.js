import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { User } from "../models/userModel.js";


export const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const userExists = await User.findOne({ email });
    if (userExists) throw new Error("Usuário já existe");

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({ name, email, password: hashed });

    // cria um token, precisa incluir o conteudo do token (os dados do usuário), a senha do token (.env), e o tempo que expira
    const accessToken = jwt.sign({
        user: {
            username: user.username,
            email: user.email,
            id: user.id,
        },
    }, process.env.ACCESS_TOKEN_SECRET, {expiresIn: "2h"})

    res.status(201).json({ accessToken });
});

export const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password)))
        throw new Error("Credenciais inválidas");

    // cria um token, precisa incluir o conteudo do token (os dados do usuário), a senha do token (.env), e o tempo que expira
    const accessToken = jwt.sign({
        user: {
            username: user.username,
            email: user.email,
            id: user.id,
        },
    }, process.env.ACCESS_TOKEN_SECRET, {expiresIn: "2h"})

    res.json({ accessToken });
});