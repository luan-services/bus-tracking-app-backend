import Joi from "joi"

// define o schema de validação para registro
export const authRegisterSchema = Joi.object({
    name: Joi.string().max(12).required().messages({
        'string.empty': 'Name is required', // mensagens custom para cada erro, se não adicionadas, o joi lança mensagens padrao
        'any.required': 'Name is required',
        'string.max': 'Name must be at most {#limit} characters'
    }),
    last_name: Joi.string().max(32).required().messages({
        'string.empty': 'Last Name is required', // mensagens custom para cada erro, se não adicionadas, o joi lança mensagens padrao
        'any.required': 'Last Name is required',
        'string.max': 'Last Name must be at most {#limit} characters'
    }),
    email: Joi.string().email().required().messages({
        'string.email': 'A valid email is required',
        'any.required': 'Email is required'
    }),
    code: Joi.string().max(6).required().messages({
        'string.empty': 'Code is required', // mensagens custom para cada erro, se não adicionadas, o joi lança mensagens padrao
        'any.required': 'Code is required',
        'string.max': 'Code must be at most {#limit} characters'
    }),
    cpf: Joi.string().length(11).required().messages({
        'string.empty': 'CPF is required', // mensagens custom para cada erro, se não adicionadas, o joi lança mensagens padrao
        'any.required': 'CPF is required',
        'string.lenght': 'CPF must be exactly {#limit} characters'
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

// define o schema de validação para login, inclui campo 'rememberMe' para decidir se o usuário quer manter a sessão p sempre ou apenas até fechar a página
export const authLoginSchema = Joi.object({
    email: Joi.string().email().required().messages({
        'string.email': 'A valid email is required',
        'any.required': 'Email is required'
    }),
    password: Joi.string().min(8).max(60).required().messages({
        'string.empty': 'Phone is required',
        'any.required': 'Phone is required',
        'string.min': 'Password must be at least {#limit} characters',
        'string.max': 'Password must be at maximum {#limit} characters'
    }),
    rememberMe: Joi.boolean().required().messages({
        "boolean.base": `"rememberMe" must be a boolean value (true or false).`,
        "any.required": `"rememberMe" is required.`
    })
});

