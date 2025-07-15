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
    const { email, password, rememberMe } = req.body;

    // caso não tenha sido preenchido
    if (!email || !password || !rememberMe ) {
        res.status(400)
        throw new Error("all fields are mandatory")
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
        }, process.env.ACCESS_TOKEN_SECRET, {expiresIn: "8h"})

        const refreshToken = jwt.sign({ 
            id: user.id 
        }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "7d" });

        // envia accessToken via cookie seguro
        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            // secure true ou false diz se o cookie só podia ser enviado via https ou http; process.env.NODE_ENV === "production" retorna false caso a variavel NODE_ENV em .env seja diff de production   
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax", // impede que o cookie seja enviado por outros sites, se não adicionar isso, é necessáiro usar CORS
            // se rememberMe for true, o cookie dura 7 dias, se for false ele é apagado ao fechar o site
            maxAge: rememberMe ? 8 * 60 * 60 * 1000 : undefined, // 8hrs
        });

        // envia refreshToken via cookie seguro
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            // secure true ou false diz se o cookie só podia ser enviado via https ou http; process.env.NODE_ENV === "production" retorna false caso a variavel NODE_ENV em .env seja diff de production   
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax", // impede que o cookie seja enviado por outros sites, se não adicionar isso, é necessáiro usar CORS
            // se rememberMe for true, o cookie dura 7 dias, se for false ele é apagado ao fechar o site
            maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : undefined,
        });


        return res.json({
            message: "User logged in successfully",
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } else {
        res.status(401)
        throw new Error("email or password invalid")
    }
});

//@desc Refresh token
//@route POST /api/users/refresh
//@access private
export const refreshToken = asyncHandler(async (req, res) => {
    // lê os cookies que vieram junto c o request
    const cookies = req.cookies;  
    // se não há cookie de refresh, jogan ovo erro
    if (!cookies?.refreshToken) {
        res.status(401);
        throw new Error("No refresh token");
    }

    // salva o token dentro do cookie de refresh na const token
    const token = cookies.refreshToken;
    
    let decoded;
    // é necessário usar try catch porque precisamos do valor de decoded fora da função jwt.verify
    try {
        decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    } catch (err) {
        res.status(403);
        throw new Error("Invalid refresh token or session expired");
    }

    // checa se o usuário não foi deletado do banco de dados, para impedir usuários banidos de usarem o token.
    const user = await User.findById(decoded.id);
    if (!user) {
        res.status(403);
        throw new Error("User no longer exists");
    }


    // caso sim, gera um novo access token
    const newAccessToken = jwt.sign(
        {
            user: {
                username: user.username,
                email: user.email,
                id: user.id,
                role: user.role,
            },
            
        },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "8h" }
    );

    // envia accessToken via cookie seguro
    res.cookie("accessToken", newAccessToken, {
        httpOnly: true,
        // secure true ou false diz se o cookie só podia ser enviado via https ou http; process.env.NODE_ENV === "production" retorna false caso a variavel NODE_ENV em .env seja diff de production   
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax", // impede que o cookie seja enviado por outros sites, se não adicionar isso, é necessáiro usar CORS
        // se rememberMe for true, o cookie dura 7 dias, se for false ele é apagado ao fechar o site
        maxAge: 8 * 60 * 60 * 1000, // 8hrs
    });

    // envia o novo token como resposta
    return res.status(200).json({ message: "Token updated successfully" });
});


//@desc Logout user (clear cookie)
//@route POST /api/users/logout
//@access private
export const logoutUser = asyncHandler(async (req, res) => {

    const cookies = req.cookies;  
    // do not try to logout if there is no cookie
    if (!cookies?.refreshToken && !cookies?.accessToken) {
        res.status(401);
        throw new Error("No refresh token");
    }
    
    // remove o cookie do refresh token (precisa botar as opções originais do cookie criado e o nome, se não não limpa)
    res.clearCookie("refreshToken", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
    });
    // remove o cookie do accessToken
    res.clearCookie("accessToken", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
    });

    // após realizar o log out, é necessário apagar o accessToken pois ele dura até 15min (isso é feito no frontend)
    return res.status(200).json({ message: "Logged out successfully" });
});