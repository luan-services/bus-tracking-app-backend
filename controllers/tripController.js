import asyncHandler from 'express-async-handler';

import { Trip } from '../models/tripModel.js';
import { Line } from '../models/lineModel.js';

import { ETAHistory } from '../models/etaHistoryModel.js';

import turf from '@turf/turf';

// --- HELPER DE ETA (Refatorado) ---
/**
 * Calcula o ETA para todas as paradas futuras com base no progresso atual e no histórico.
 */
const calculateETAs = async (line, currentDistance) => {
  const upcomingStops = line.stops.filter(stop => stop.distanceFromStart > currentDistance);
  if (upcomingStops.length === 0) return [];

  const etas = [];
  let cumulativeTime = 0;
  let lastDistance = currentDistance;

  // Calcula o tempo para a primeira parada futura
  const firstUpcomingStop = upcomingStops[0];
  const lastReachedStop = line.stops.slice().reverse().find(s => s.distanceFromStart <= currentDistance);
  
  if (lastReachedStop) {
    const etaRecord = await ETAHistory.findOne({
      line: line._id,
      from: lastReachedStop.name,
      to: firstUpcomingStop.name
    });

    if (etaRecord) {
      const segmentTotalDistance = firstUpcomingStop.distanceFromStart - lastReachedStop.distanceFromStart;
      const progressInSegment = (currentDistance - lastReachedStop.distanceFromStart) / segmentTotalDistance;
      const remainingTimeInSegment = etaRecord.averageDuration * (1 - progressInSegment);
      cumulativeTime += remainingTimeInSegment;
      etas.push({ stopName: firstUpcomingStop.name, etaMinutes: Math.round(cumulativeTime) });
    }
  }

  // Calcula o tempo para as paradas subsequentes
  for (let i = 0; i < upcomingStops.length - 1; i++) {
    const from = upcomingStops[i];
    const to = upcomingStops[i + 1];

    const etaRecord = await ETAHistory.findOne({
      line: line._id,
      from: from.name,
      to: to.name
    });

    if (etaRecord && etaRecord.averageDuration) {
      cumulativeTime += etaRecord.averageDuration;
      etas.push({ stopName: to.name, etaMinutes: Math.round(cumulativeTime) });
    }
  }

  return etas;
};

////////////////

//@desc Start a trip
//@route POST /api/trips/start
//@access private (driver, admin)
export const startTrip = asyncHandler(async (req, res) => {
    const { lineId, lat, lng } = req.body;
    if (!lineId || !lat || !lng) {
        res.status(400);
        throw new Error("All fields are mandatory");
    }
    const line = await Line.findById(lineId);
    if (!line) {
        res.status(404);
        throw new Error("Line not found");
    }
    if (!req.user || (req.user.role !== "driver" && req.user.role !== "admin")) {
        res.status(403);
        throw new Error("User not authorized or not logged in");
    }
    const existingTrip = await Trip.findOne({ driver: req.user.id, isActive: true });
    if (existingTrip) {
        res.status(400);
        throw new Error(`User already has an active trip ${existingTrip.id}`);
    }
    const initialPosition = { type: 'Point', coordinates: [lng, lat] };
    const routeLineString = turf.lineString(line.routePath.coordinates);
    const snapped = turf.nearestPointOnLine(routeLineString, initialPosition, { units: 'kilometers' });
    const distanceTraveledInitial = snapped.properties.location;
    const trip = await Trip.create({
        driver: req.user.id,
        line: lineId,
        currentPosition: { ...initialPosition, updatedAt: new Date() },
        lastPosition: initialPosition,
        distanceTraveled: distanceTraveledInitial,
        stopsReached: [],
    });
    return res.status(201).json({ message: "Trip started successfully", trip: trip });
});

//@desc Update position on a trip
//@route PATCH /api/trips/:tripid/position
//@access private (driver, admin)
export const updatePosition = asyncHandler(async (req, res) => {
	const { tripId } = req.params;
	const { lat, lng } = req.body;

	if (!lat || !lng) {
		res.status(400).json({ message: 'Latitude e longitude obrigatórias' });
		return;
	}

	const trip = await Trip.findById(tripId).populate({
		path: 'line',
		model: 'Line'
	});

	if (!trip || !trip.isActive) {
		res.status(404).json({ message: 'Viagem não encontrada ou finalizada' });
		return;
	}
	
	// O driver pode ser validado aqui, se necessário

	const line = trip.line;
	const newPosition = { type: 'Point', coordinates: [lng, lat] };

	// --- LÓGICA DE PROGRESSO CONTÍNUO ---
	if (trip.lastPosition?.coordinates?.length === 2) {
		const distanceIncrement = turf.distance(
		trip.lastPosition.coordinates,
		newPosition.coordinates,
		{ units: 'kilometers' }
		);
		trip.distanceTraveled += distanceIncrement;
	}
	
	trip.currentPosition = { ...newPosition, updatedAt: new Date() };
	trip.lastPosition = newPosition;

	// --- LÓGICA PARA MARCAR PARADAS E SALVAR HISTÓRICO ---
	for (const stop of line.stops) {
		const alreadyReached = trip.stopsReached.some(s => s.stopName === stop.name);
		if (alreadyReached) continue;

		// Usa a distância pré-calculada para checar se a parada foi ultrapassada
		if (trip.distanceTraveled >= stop.distanceFromStart) {
		const now = new Date();
		const lastReached = trip.stopsReached[trip.stopsReached.length - 1];

		// Se houver uma parada anterior, salva o tempo de viagem entre elas
		if (lastReached) {
			const from = lastReached.stopName;
			const to = stop.name;
			const newDuration = (now - new Date(lastReached.reachedAt)) / 60000; // minutos

			// Lógica correta para atualizar a média real
			let etaRecord = await ETAHistory.findOne({ line: line._id, from, to });
			if (etaRecord) {
			const oldTotalDuration = etaRecord.averageDuration * etaRecord.sampleCount;
			const newSampleCount = etaRecord.sampleCount + 1;
			etaRecord.averageDuration = (oldTotalDuration + newDuration) / newSampleCount;
			etaRecord.sampleCount = newSampleCount;
			} else {
			etaRecord = new ETAHistory({
				line: line._id, from, to, averageDuration: newDuration, sampleCount: 1
			});
			}
			await etaRecord.save();
		}
		trip.stopsReached.push({ stopName: stop.name, reachedAt: now });
		}
	}

	// --- ATUALIZAÇÃO DE ETAs E SALVAMENTO ---
	trip.stopETAs = await calculateETAs(line, trip.distanceTraveled);
	await trip.save();

	// --- EMISSÃO VIA SOCKET.IO ---
	const io = req.app.get('io');
	io.to(tripId).emit('positionUpdate', {
		coordinates: trip.currentPosition.coordinates,
		stopETAs: trip.stopETAs,
	});

	res.status(200).json({ 
		message: 'Posição atualizada com sucesso',
		currentProgress: trip.distanceTraveled / turf.length(turf.lineString(line.routePath.coordinates), { units: 'kilometers' }), // Apenas para debug
		stopETAs: trip.stopETAs 
	});
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