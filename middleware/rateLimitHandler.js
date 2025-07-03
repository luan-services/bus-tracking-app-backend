import rateLimit from "express-rate-limit";

export const rateLimitHandler = (time, limit) => {
    return rateLimit({
        windowMs: time, // 15 minutos
        max: limit, // limita cada IP a 100 requisições por janela (15 min)
        message: {
            status: 429,
            message: "Too many requests! Try again later",
        },
        standardHeaders: true, // inclui rate limit nos headers
        legacyHeaders: false, // desativa os headers 'X-RateLimit-*'
    });
}