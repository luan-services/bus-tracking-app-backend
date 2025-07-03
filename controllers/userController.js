import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

import { User } from "../models/userModel.js";

//@desc Register user
//@route POST /api/users/register
//@access public
export const registerUser = asyncHandler(async (req, res) => {
    const { username, email, password } = req.body;

    // apesar do mongoose já dar levantar erro se o email já existir no db, é boa pratica usar um tester:
    const userExists = await User.findOne({ email });
    if (userExists) {
        res.status(400);
        throw new Error('User already exists');
    }   

    // realiza o hashing da senha
    const hashedPassword = await bcrypt.hash(password, 10);
    // cria usuário
    const user = await User.create({ 
        username: username, 
        email: email, 
        password: hashedPassword,
        role: "user"
    });

    // cria um token, precisa incluir o conteudo do token (os dados do usuário), a senha do token (.env), e o tempo que expira
    const accessToken = jwt.sign({
        user: {
            username: user.username,
            email: user.email,
            id: user.id,
            role: user.role
        },
    }, process.env.ACCESS_TOKEN_SECRET, {expiresIn: "2h"})

    // retorna token de acesso
    return res.status(201).json({ accessToken });
});

//@desc Login user
//@route POST /api/users/login
//@access public
export const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // caso não tenha sido preenchido
    if (!email || !password) {
        res.status(400)
        throw new Error("All fields are mandatory")
    }

    const user = await User.findOne({ email });

    if (user && (await bcrypt.compare(password, user.password))) {
        // cria um token, precisa incluir o conteudo do token (os dados do usuário), a senha do token (.env), e o tempo que expira
        const accessToken = jwt.sign({
            user: {
                username: user.username,
                email: user.email,
                id: user.id,
                role: user.role,
            },
        }, process.env.ACCESS_TOKEN_SECRET, {expiresIn: "2h"})

        return res.json({ accessToken });

    } else {
        res.status(401)
        throw new Error("email or password invalid")
    }
});