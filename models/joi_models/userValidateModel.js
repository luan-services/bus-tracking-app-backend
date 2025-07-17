import Joi from "joi"

// define o schema de criação de usuário por admin
export const userCreateSchema = Joi.object({
    username: Joi.string().max(12).required().messages({
        'string.empty': 'Name is required', // mensagens custom para cada erro, se não adicionadas, o joi lança mensagens padrao
        'any.required': 'Name is required',
        'string.max': 'Name must be at most {#limit} characters'
    }),
    email: Joi.string().email().required().messages({
        'string.email': 'A valid email is required',
        'any.required': 'Email is required'
    }),
    password: Joi.string().min(8).max(60).required().messages({
        'string.empty': 'Password is required',
        'any.required': 'Password is required',
        'string.min': 'Password must be at least {#limit} characters',
        'string.min': 'Password must be at maximum {#limit} characters'
    }),
    role: Joi.string().valid('admin', 'user').default('user').messages({
        'any.only': 'Role must be either "admin" or "user"',
        }),
});

export const userUpdateSchema = Joi.object({
    username: Joi.string().max(12).messages({
        'string.empty': 'Name is required', // mensagens custom para cada erro, se não adicionadas, o joi lança mensagens padrao
        'any.required': 'Name is required',
        'string.max': 'Name must be at most {#limit} characters'
    }),
    email: Joi.string().email().messages({
        'string.email': 'A valid email is required',
        'any.required': 'Email is required'
    }),
    password: Joi.string().min(8).max(60).messages({
        'string.empty': 'Password is required',
        'any.required': 'Password is required',
        'string.min': 'Password must be at least {#limit} characters',
        'string.min': 'Password must be at maximum {#limit} characters'
    }),
    role: Joi.string().valid('admin', 'user').default('user').messages({
        'any.only': 'Role must be either "admin" or "user"',
        }),
});


// define o model joi da table user para pesquisa por ID (o ID do mongoose é um object string de 24 char e hex)
export const userSearchSchema = Joi.object({
    id: Joi.string().length(24).hex().min(1).required().messages({ // define o campo name
        'string.empty': 'user ID is required', // mensagens custom para cada erro, se não adicionadas, o joi lança mensagens padrao
        'any.required': 'user ID is required',
        'string.base': 'user ID must be a string',
        'string.length': 'user ID must be exactly 24 characters',
        'string.hex': 'user ID must be a valid hexadecimal string',
    }),
});
