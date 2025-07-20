import asyncHandler from "express-async-handler"

import { User } from "../models/userModel.js"

// importando library de criptografia de senhas
import bcrypt from "bcrypt"

//@desc Get all users data
//@route GET /api/users
//@access private (admin)
export const getAllUsers = asyncHandler(async (req, res) => {
    if (!req.user) {
        res.status(403);
        throw new Error("User not Authorized.");
    }

    const currentUser = await User.findById(req.user.id).select("-password");

    if (!currentUser || currentUser.role != 'admin') {
        res.status(403);
        throw new Error("User not Authorized.");
    }

    // procura o user no banco de dados baseado no model (todas essas funções vem diretamente do schema do mangoose, que vem com funções built-in para gerenciar o db)
    const users = await User.find();

    if (!users) {
        res.status(404);
        throw new Error("No user found");
    }
    
    // envia uma resposta ao frontend com os dados do contato
    return res.status(200).json(users);
})

//@desc Get a specific user data
//@route GET /api/users/:id
//@access private (admin)
export const getUser = asyncHandler(async (req, res) => {
    if (!req.user) {
        res.status(403);
        throw new Error("User not Authorized.");
    }

    const currentUser = await User.findById(req.user.id).select("-password");

    if (!currentUser || currentUser.role != 'admin') {
        res.status(403);
        throw new Error("User not Authorized.");
    }

    // procura o user no banco de dados baseado no model (todas essas funções vem diretamente do schema do mangoose, que vem com funções built-in para gerenciar o db)
    const user = await User.findById(req.params.id);

    if (!user) {
        res.status(404);
        throw new Error("User not found");
    }

    // envia uma resposta ao frontend com os dados do contato
    return res.status(200).json(user);
})

//@desc Get current user info
//@route GET /api/users/current/me
//@access private (driver, admin)
export const currentUser = asyncHandler(async (req, res) => {

    if (!req.user) {
        res.status(403);
        throw new Error("User not Authorized.");
    }

    const user = await User.findById(req.user.id).select("-password");

    if (!user || (user.role != 'user' && user.role != 'admin')) {
        res.status(403);
        throw new Error("User not Authorized.");
    }

    return res.status(200).json({ id: user.id, name: user.name, last_name: user.last_name, email: user.email, code: user.code, cpf: user.cpf, role: user.role });
})

//@desc Create a user
//@route POST /api/users
//@access private (admin)
export const createUser = asyncHandler(async (req, res) => {
    if (!req.user) {
        res.status(403);
        throw new Error("User not Authorized.");
    }

    const currentUser = await User.findById(req.user.id).select("-password");

    if (!currentUser || currentUser.role != 'admin') {
        res.status(403);
        throw new Error("User not Authorized.");
    }
    
    // passa os dados do request para constantes
    const {name, last_name, email, code, cpf, password} = req.body

    if (!name || !last_name || !email || !code || !cpf || !password) {
        res.status(400);
        throw new Error("Some fields are missing.");
    }

    // apesar do mongoose já dar levantar erro se o email já existir no db, é boa pratica usar um tester:
    const userExists = await User.findOne({ email });
    if (userExists) {
        res.status(400);
        throw new Error('User already exists');
    }   

    // hashing da senha (12 é o numero de salt_rounds (qts vezes o hashing é aplicado))
    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await User.create({
        name: name,
        last_name: last_name,
        email: email,
        code: code,
        cpf: cpf,
        password: hashedPassword,
    });

    console.log(`User created ${user}`)
    
    if (user) {
        // envia uma resposta json com o id do user e o email
        return res.status(201).json({id: user.id, email: user.email});
    } else {
        res.status(400)
        throw new Error("User data is not valid")
    }
})

//@desc Update a specific user data
//@route PATCH /api/users/:id
//@access private (admin)
export const updateUser = asyncHandler(async (req, res) => {
    if (!req.user) {
        res.status(403);
        throw new Error("User not Authorized.");
    }

    const currentUser = await User.findById(req.user.id).select("-password");

    if (!currentUser || currentUser.role != 'admin') {
        res.status(403);
        throw new Error("User not Authorized.");
    }
    

    // hashing da senha (12 é o numero de salt_rounds (qts vezes o hashing é aplicado))
    let hashedPassword;

    if (req.body.password) {
        hashedPassword = await bcrypt.hash(req.body.password, 10)
        req.body.password = hashedPassword
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, 
            req.body, { new: true } // returns the updated document
    );

    console.log(`User updated ${updatedUser}`)
    
    if (updatedUser) {
        // envia uma resposta json com o id do user e o email
        return res.status(201).json({_id: updatedUser.id, email: updatedUser.email});
    } else {
        res.status(400)
        throw new Error("User data is not valid")
    }
})

//@desc Delete a specific user data
//@route DELETE /api/users/:id
//@access private (admin)
export const deleteUser = asyncHandler(async (req, res) => {
    if (!req.user) {
        res.status(403);
        throw new Error("User not Authorized.");
    }

    const currentUser = await User.findById(req.user.id).select("-password");

    if (!currentUser || currentUser.role != 'admin') {
        res.status(403);
        throw new Error("User not Authorized.");
    }

    const user = await User.findById(req.params.id);
    // se não existe lança erro
    if (!user) {
        res.status(404);
        throw new Error("User not found");
    }
    // deleta o contato (todas essas funções vem diretamente do schema do mangoose, que vem com funções built-in para gerenciar o db)
    await user.deleteOne();
    // envia uma resposta ao frontend dizendo q o contato foi deletado
    return res.status(200).json({ message: `Deleted user ${req.params.id}` });
})