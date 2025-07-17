import Joi from 'joi';

const stopCreateSchema = Joi.object({
    name: Joi.string().required().messages({
        'any.required': 'Stop Name is required',
        'string.empty': 'Stop Name cannot be empty',
    }),
    location: Joi.object({
        type: Joi.string().valid('Point').required().messages({
            'any.only': 'Location type must be "Point"',
            'any.required': 'Location type is required',
        }),
        // Validates an array of exactly 2 numbers [longitude, latitude]
        coordinates: Joi.array().ordered(
            Joi.number().min(-180).max(180).required(), // Longitude
            Joi.number().min(-90).max(90).required()  // Latitude
        ).length(2).required().messages({
            'array.length': 'Coordinates must contain exactly 2 numbers [lng, lat]',
            'any.required': 'Stop coordinates are required',
        }),
    }).required(),
    // These fields are optional in your Mongoose schema
    stopProgress: Joi.number().optional(),
    distanceFromStart: Joi.number().optional()
});

export const lineCreateSchema = Joi.object({
    lineNumber: Joi.string().required().messages({
        'any.required': 'Line number is required',
    }),
    name: Joi.string().required().messages({
        'any.required': 'Line name is required',
    }),
    // An optional array of strings
    schedule: Joi.array().items(Joi.string()).optional(),
    // An optional string, can be empty
    itinerary: Joi.string().optional().allow(''),
    // An array of stop objects, each must match stopSchemaJoi
    stops: Joi.array().items(stopCreateSchema).min(1).required().messages({
        'array.min': 'At least one stop is required',
        'any.required': 'Stops are required',
    }),
    routePath: Joi.object({
        type: Joi.string().valid('LineString').required().messages({
            'any.only': 'Route path type must be "LineString"',
        }),
        // An array of coordinate pairs, must have at least 2 for a line
        coordinates: Joi.array().items(
            Joi.array().ordered(
                Joi.number().min(-180).max(180).required(), // Longitude
                Joi.number().min(-90).max(90).required()  // Latitude
            ).length(2)
        ).min(2).required().messages({
            'array.min': 'A route path must have at least 2 coordinate pairs',
            'any.required': 'Route path coordinates are required',
        }),
    }).required(),
});

// define o model joi da table user para pesquisa por ID (o ID do mongoose é um object string de 24 char e hex)
export const lineSearchSchema = Joi.object({
    id: Joi.string().length(24).hex().min(1).required().messages({ // define o campo name
        'string.empty': 'Line ID is required', // mensagens custom para cada erro, se não adicionadas, o joi lança mensagens padrao
        'any.required': 'Line ID is required',
        'string.base': 'Line ID must be a string',
        'string.length': 'Line ID must be exactly 24 characters',
        'string.hex': 'Line ID must be a valid hexadecimal string',
    }),
});