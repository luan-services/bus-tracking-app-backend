// middleware de validação que recebe o schema como parametro, ve de onde o request vem (body ou params [source=]) e trata os erros
export const validateJoiSchema = (schema, source = 'body') => { // source é a fonte dos dados, por default é body, mas se colocar params vai ler do endereço do route (contacts/129830193)
    return (req, res, next) => {
        const { error } = schema.validate(req[source], { abortEarly: false }); 

        if (error) {
            const errorMessages = error.details.map(detail => detail.message);
            res.status(400);
            throw new Error(errorMessages.join(', '));
        }

        next();
    };
};