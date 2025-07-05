import asyncHandler from 'express-async-handler';

import { Line } from '../models/lineModel.js';

import { precalculateStopData } from '../utils/routeHelpers.js';

//@desc Get all lines
//@route GET /api/lines/
//@access public
export const getAllLines = asyncHandler(async (req, res) => {
	const lines = await Line.find({});

	return res.status(200).json(lines);	
});

//@desc Get a line by id params
//@route GET /api/lines/:id
//@access public
export const getLineById = asyncHandler(async (req, res) => {

	const line = await Line.findById(req.params.id);

	if (!line) {
		res.status(404);
		throw new Error('Line not found');
	}
	
	return res.status(200).json(line);

});

//@desc Create a line
//@route POST /api/lines/
//@access private (admin)
export const createLine = asyncHandler(async (req, res) => {

    if (!req.user || req.user.role != "admin") {
        res.status(403)
        throw new Error("Logged user is not an admin")
    }

    const { lineNumber, name, schedule, itinerary, stops, routePath } = req.body;

    if (!lineNumber || !name || !schedule || !itinerary || !stops || !routePath ) {
        res.status(400)
        throw new Error("All fields are mandatory")
    }

    // Cria a linha no banco de dados
    const line = await Line.create({ 
            lineNumber: lineNumber,
            name: name,
            schedule: schedule,
            itinerary: itinerary,
            stops: stops,
            routePath: routePath
    });

    if (line) {
        try {
            // 2. Chame a função de pré-cálculo após a criação bem-sucedida
            await precalculateStopData(line._id);
        } catch (error) {
            // Loga um erro se o pré-cálculo falhar, mas não impede a resposta,
            // pois a linha já foi criada. Isso pode ser ajustado se o pré-cálculo for crítico.
            console.error(`Falha ao pré-calcular dados para a linha ${line._id}:`, error);
        }

        // 3. Busca a linha novamente para retornar o documento completo com os dados pré-calculados
        const updatedLine = await Line.findById(line._id);
        return res.status(201).json(updatedLine);

    } else {
        res.status(400);
        throw new Error("Invalid line data");
    }
});