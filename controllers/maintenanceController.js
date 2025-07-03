import asyncHandler from 'express-async-handler';

import { Trip } from '../models/tripModel.js';

//@desc Get trips ended with more than 1 day
//@route GET /api/maintenance/old-trips
//@access private (admin)
export const getOldTrips = asyncHandler(async (req, res) => {

	if (!req.user || req.user.role != "admin") {
		res.status(403)
		throw new Error("Logged user is not an admin")
	}

	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - 1);

	const trips = await Trip.find({
		isActive: false,
		updatedAt: { $lt: cutoff },
	}).populate('driver', 'name email').populate('line', 'lineNumber name');

	return res.status(200).json(trips);
});

//@desc Remove trips ended with more than 1 day
//@route POST /api/maintenance/delete-trips
//@access private (admin)
export const deleteOldTrips = asyncHandler(async (req, res) => {

	if (!req.user || req.user.role != "admin") {
		res.status(403)
		throw new Error("Logged user is not an admin")
	}

	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - 1);

	const result = await Trip.deleteMany({
		isActive: false,
		updatedAt: { $lt: cutoff },
	});

	return res.status(200).json({
		message: "Trips for the last 1 day deleted",
		deletedCount: result.deletedCount,
	});
});

