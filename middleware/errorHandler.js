// importa as constants e seus respectivos errors/numeros
import { constants } from "../constants.js";

export const errorHandler = (err,req,res,next) => {
    // checa se um status foi lançado antes do erro, caso contrário, usa o status 500 (SERVER_ERROR)
    const statusCode = res.statusCode ? res.statusCode : 500

    // erro do MongoDB de key duplicada Key Error (restrição email unique )
    if (err.name === 'MongoServerError' && err.code === 11000) {
        res.status(400);
        return res.json({
            title: "Duplicate Key Error",
            message: `Duplicate value entered for ${Object.keys(err.keyValue)} field`,
            stackTrace: process.env.NODE_ENV === 'production' ? null : err.stack,
        });
    }

    // le a constant statusCode e lança uma resposta em json como o respectivo erro.
    switch (statusCode) {
        case constants.VALIDATION_ERROR:
            res.json({title: "Validation Error", message: err.message, stackTrace: process.env.NODE_ENV === 'production' ? null : err.stack});
            break;
        case constants.NOT_FOUND:
            res.json({title: "Not Found", message: err.message, stackTrace: process.env.NODE_ENV === 'production' ? null : err.stack});
            break;
        case constants.UNAUTHORIZED:
            res.json({title: "Unauthorized", message: err.message, stackTrace: process.env.NODE_ENV === 'production' ? null : err.stack});
            break;
        case constants.FORBIDDEN:
            res.json({title: "Forbidden", message: err.message, stackTrace: process.env.NODE_ENV === 'production' ? null : err.stack});
            break;
        case constants.SERVER_ERROR:
            res.json({title: "Server Error", message: err.message, stackTrace: process.env.NODE_ENV === 'production' ? null : err.stack});
            break;
        case constants.TOO_MANY_REQUESTS:
            res.json({title: "Too many requests", message: err.message, stackTrace: process.env.NODE_ENV === 'production' ? null : err.stack});
            break;
        default:
            // para qualquer erro desconhecido:
            res.status(500).json({
                title: "Server Error",
                message: err.message,
                stackTrace: process.env.NODE_ENV === 'production' ? null : err.stack,
            });
            break;
    }
}