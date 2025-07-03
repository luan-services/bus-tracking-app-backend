import asyncHandler from 'express-async-handler';
import haversine from 'haversine-distance';

import { Trip } from '../models/tripModel.js';
import { Line } from '../models/lineModel.js';

import { calculateETA } from '../utils/calculateETA.js';
import { ETAHistory } from '../models/etaHistoryModel.js';

//@desc Start a trip
//@route POST /api/trips/start
//@access private (driver, admin)
export const startTrip = asyncHandler(async (req, res) => {
	const { lineId, lat, lng } = req.body;

	// todos os campos são necessário
	if (!lineId || !lat || !lng) {
		res.status(400);
		throw new Error("All fields are mandatory");
	}

	// checa se a linha existe
	const line = await Line.findById(lineId);
	if (!line) {
		res.status(404);
		throw new Error("Line not found");
	}

	// checa se existe um token de autenticação
	if (!req.user) {
		res.status(403)
		throw new Error("User not logged in")
	}

	// checa se o usuário é um motorista ou admin
	if (req.user.role == "driver" || req.user.role == "admin") {

		// check if driver already has an active trip
		const existingTrip = await Trip.findOne({
			driver: req.user.id,
			isActive: true,
		});
		if (existingTrip) {
			res.status(400);
			throw new Error(`User already have an active trip ${existingTrip.id}`);
		}

		// começa uma trip
		const trip = await Trip.create({
			driver: req.user.id,
			line: lineId,
			currentPosition: { 
				type: 'Point',
				coordinates: [lng, lat], // lembre-se: [longitude, latitude]
				updatedAt: new Date(),
			},
		});

		return res.status(201).json({ message: "Trip started successfully", trip: trip});
	} else {
		res.status(403)
		throw new Error("Logged user is not a driver")
	}
});

//@desc Update position on a trip
//@route PATCH /api/trips/:tripid/position
//@access private (driver, admin)
export const updatePosition = asyncHandler(async (req, res) => {
	const { tripId } = req.params;
	const { lat, lng } = req.body;

	if (!lat || !lng) {
		res.status(400);
		throw new Error("All fields are mandatory");
	}

	const trip = await Trip.findById(tripId);
	if (!trip || !trip.isActive) {
		res.status(404);
		throw new Error('Trip not found or already ended');
	}

	// Verifica se o motorista logado é o dono da trip
	if (trip.driver.toString() !== req.user.id) {
		res.status(403);
		throw new Error("User is not the owner of this trip");
  	}

	trip.currentPosition = {
		type: 'Point',
		coordinates: [lng, lat],
		updatedAt: new Date(),
	};

	
	const line = await Line.findById(trip.line);
	trip.stopETAs = await calculateETA(trip, line);

	// Verifica se passou por alguma parada ainda não registrada
	for (const stop of line.stops) {
		const stopAlreadyReached = trip.stopsReached.some(
			(s) => s.stopName === stop.name
		);

		if (stopAlreadyReached) continue;

		const stopPoint = {
			lat: stop.location.coordinates[1],
			lng: stop.location.coordinates[0],
		};

		const busPoint = { lat, lng };
		const distance = haversine(busPoint, stopPoint);

		if (distance < 100) { // Parada atingida
			trip.stopsReached.push({
			stopName: stop.name,
			reachedAt: new Date(),
			});
		}
	}
	
	await trip.save();

	const io = req.app.get('io');

	io.to(tripId).emit('positionUpdate', {
		coordinates: trip.currentPosition.coordinates,
		stopETAs: trip.stopETAs,
	});

	return res.status(200).json({ message: "Position updated successfully" });
});

//@desc End a trip
//@route PATCH /api/trips/:tripid/end
//@access private (driver, admin)
export const endTrip = asyncHandler(async (req, res) => {
	const { tripId } = req.params;

	const trip = await Trip.findById(tripId);
	if (!trip || !trip.isActive) {
		res.status(404);
		throw new Error('Trip not found or already ended');
	}

	// Verifica se o motorista logado é o dono da trip
	if (trip.driver.toString() !== req.user.id) {
		res.status(403);
		throw new Error("User is not the owner of this trip");
  	}

	trip.isActive = false;
	await trip.save();

	// Processar tempos reais
	const stops = trip.stopsReached;

	if (stops.length >= 2) {
		for (let i = 0; i < stops.length - 1; i++) {
		const from = stops[i];
		const to = stops[i + 1];
		const duration = (to.reachedAt - from.reachedAt) / 60000; // em minutos

		const existing = await ETAHistory.findOne({
			line: trip.line,
			from: from.stopName,
			to: to.stopName,
		});

		if (existing) {
			const newAvg = (existing.averageDuration * existing.sampleCount + duration) / (existing.sampleCount + 1);
			existing.averageDuration = newAvg;
			existing.sampleCount += 1;
			await existing.save();
		} else {
			await ETAHistory.create({
				line: trip.line,
				from: from.stopName,
				to: to.stopName,
				averageDuration: duration,
			});
		}
		}
	}

	return res.status(200).json({ message: "Trip ended, ETA History updated" });
});

//@desc Get data from a trip, for the first time accessing the frontend. (after that it'll be sent by socket.io)
//@route GET /api/trips/:tripid/track
//@access public
export const getTripLiveData = asyncHandler(async (req, res) => {
	const { tripId } = req.params;

	const trip = await Trip.findById(tripId);
	if (!trip || !trip.isActive) {
		res.status(404);
		throw new Error('Trip not found or already ended');
	}

	return res.status(200).json({
		currentPosition: trip.currentPosition,
		stopETAs: trip.stopETAs,
		routePath: trip.line.routePath,
		stops: trip.line.stops,
	});
});