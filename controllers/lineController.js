import asyncHandler from 'express-async-handler';

import { Line } from '../models/lineModel.js';

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

	const line = await Line.create({ 
			lineNumber: lineNumber,
			name: name,
			schedule: schedule,
			itinerary: itinerary,
			stops: stops,
			routePath: routePath
	});

	return res.status(201).json(line);

});