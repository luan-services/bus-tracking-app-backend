import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";

// importando o model de user
import {User} from "../models/userModel.js"

// funcao pra checar se o token é valido e passar para próximo route
export const validateJwtToken = asyncHandler( async (req, res, next) => {
        let token;
         // tenta extrair o token do cookie chamado "accessToken", o middleware 'cookie-parser' popula o objeto req.cookies
        token = req.cookies.accessToken;

        if (token) {

            let decoded;

            try {
                // verifica se o token é válido usando a chave secreta
                decoded =  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
            } catch (err) {
                // caso não, lança erro
                res.status(401)
                throw new Error("User not authorized")
            }

            // check para ver se o usuário não existem mais (caso em que o usuário é banido e seus dados apagados, mas ainda possui um token por 15min)
            const user = await User.findById(decoded.user.id).select("-password");
            if (!user) {
                res.status(401);
                throw new Error("User not found or no longer exists");
            }

            // decodifica 'user' que são os dados do usuário salvos no token e passa para o request enviado (em req.user)
            req.user = decoded.user

            // manda o request para o proximo route
            next()
        }        
        
        if (!token) {
            res.status(401);
            throw new Error("User is not authorized or token expired");
        }

});
