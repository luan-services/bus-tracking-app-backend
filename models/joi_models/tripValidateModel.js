import Joi from 'joi';

export const tripCreateSchema = Joi.object({
    lineId: Joi.string().length(24).hex().min(1).required().messages({ // define o campo name
            'string.empty': 'Line ID is required', // mensagens custom para cada erro, se não adicionadas, o joi lança mensagens padrao
            'any.required': 'Line ID is required',
            'string.base': 'Line ID must be a string',
            'string.length': 'Line ID must be exactly 24 characters',
            'string.hex': 'Line ID must be a valid hexadecimal string',
    }),
    lat: Joi.number().min(-90).max(90).required().messages({
        'number.base': 'Latitude must be a number',
        'number.min': 'Latitude must be at least -90',
        'number.max': 'Latitude must be at most 90',
        'any.required': 'Latitude is required'
    }),
    lng: Joi.number().min(-180).max(180).required().messages({
        'number.base': 'Longitude must be a number',
        'number.min': 'Longitude must be at least -180',
        'number.max': 'Longitude must be at most 180',
        'any.required': 'Longitude is required'
    })
});

export const positionUpdateSchema = Joi.object({
    lat: Joi.number().min(-90).max(90).required().messages({
        'number.base': 'Latitude must be a number',
        'number.min': 'Latitude must be at least -90',
        'number.max': 'Latitude must be at most 90',
        'any.required': 'Latitude is required'
    }),
    lng: Joi.number().min(-180).max(180).required().messages({
        'number.base': 'Longitude must be a number',
        'number.min': 'Longitude must be at least -180',
        'number.max': 'Longitude must be at most 180',
        'any.required': 'Longitude is required'
    })
});

export const tripSearchSchema = Joi.object({
    tripId: Joi.string().length(24).hex().min(1).required().messages({ // define o campo name
        'string.empty': 'user ID is required', // mensagens custom para cada erro, se não adicionadas, o joi lança mensagens padrao
        'any.required': 'user ID is required',
        'string.base': 'user ID must be a string',
        'string.length': 'user ID must be exactly 24 characters',
        'string.hex': 'user ID must be a valid hexadecimal string',
    }),
});
