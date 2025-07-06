import asyncHandler from 'express-async-handler';

import { Trip } from '../models/tripModel.js';
import { Line } from '../models/lineModel.js';

import { ETAHistory } from '../models/etaHistoryModel.js';

import * as turf from '@turf/turf';

// --- HELPER DE ETA (Refatorado) ---
/**
 * Calcula o ETA para todas as paradas futuras com base no progresso atual e no histórico.
 */
// --- HELPER DE ETA (MODELO HÍBRIDO FINAL) ---
const calculateETAs = async (line, currentDistance, realTimeSpeedKmh) => {
  const DEFAULT_BUS_SPEED_KMH = 20;
  const MIN_RELIABLE_SPEED_KMH = 5;

  const allEtaRecords = await ETAHistory.find({ line: line._id });
  const etaHistoryMap = new Map();
  allEtaRecords.forEach(record => {
    etaHistoryMap.set(`${record.from}->${record.to}`, record);
  });

  const upcomingStops = line.stops.filter(stop => stop.distanceFromStart > currentDistance);
  if (upcomingStops.length === 0) return [];

  const etas = [];
  let cumulativeTime = 0;
  
  const lastReachedStop = line.stops.slice().reverse().find(s => s.distanceFromStart <= currentDistance);
  const firstUpcomingStop = upcomingStops[0];
  
  if (lastReachedStop) {
    const remainingDistance = firstUpcomingStop.distanceFromStart - currentDistance;
    if (realTimeSpeedKmh > MIN_RELIABLE_SPEED_KMH) {
        cumulativeTime += (remainingDistance / realTimeSpeedKmh) * 60;
    } else {
        const key = `${lastReachedStop.name}->${firstUpcomingStop.name}`;
        const etaRecord = etaHistoryMap.get(key);
        if (etaRecord?.averageDuration) {
            const segmentTotalDistance = firstUpcomingStop.distanceFromStart - lastReachedStop.distanceFromStart;
            const progressInSegment = segmentTotalDistance > 0 ? (currentDistance - lastReachedStop.distanceFromStart) / segmentTotalDistance : 0;
            cumulativeTime += etaRecord.averageDuration * (1 - progressInSegment);
        } else {
            cumulativeTime += (remainingDistance / DEFAULT_BUS_SPEED_KMH) * 60;
        }
    }
    etas.push({ stopName: firstUpcomingStop.name, etaMinutes: Math.round(cumulativeTime) });
  } else if (line.stops.length > 0) {
      const firstStop = line.stops[0];
      const distanceToFirstStop = firstStop.distanceFromStart - currentDistance;
      const speedToUse = realTimeSpeedKmh > MIN_RELIABLE_SPEED_KMH ? realTimeSpeedKmh : DEFAULT_BUS_SPEED_KMH;
      if (distanceToFirstStop > 0) {
          cumulativeTime += (distanceToFirstStop / speedToUse) * 60;
          etas.push({ stopName: firstStop.name, etaMinutes: Math.round(cumulativeTime) });
      }
  }

  for (let i = 0; i < upcomingStops.length - 1; i++) {
    const fromStop = upcomingStops[i];
    const toStop = upcomingStops[i + 1];
    const key = `${fromStop.name}->${toStop.name}`;
    const etaRecord = etaHistoryMap.get(key);
    if (etaRecord?.averageDuration) {
      cumulativeTime += etaRecord.averageDuration;
    } else {
      const segmentDistance = toStop.distanceFromStart - fromStop.distanceFromStart;
      cumulativeTime += (segmentDistance / DEFAULT_BUS_SPEED_KMH) * 60;
    }
    etas.push({ stopName: toStop.name, etaMinutes: Math.round(cumulativeTime) });
  }
  return etas;
};

function calculateRealTimeSpeed(lastPosition, newPosition) {
    if (!lastPosition || !lastPosition.coordinates || !lastPosition.updatedAt) return 0;
    const distanceIncrement = turf.distance(lastPosition.coordinates, newPosition.coordinates, { units: 'kilometers' });
    const timeDiffSeconds = (new Date(newPosition.updatedAt) - new Date(lastPosition.updatedAt)) / 1000;
    if (timeDiffSeconds <= 0) return 0;
    const speedKps = distanceIncrement / timeDiffSeconds;
    return speedKps * 3600; // km/h
}

////////////////

//@desc Start a trip
//@route POST /api/trips/start
//@access private (driver, admin)
// --- CONTROLLER startTrip (COM VALIDAÇÃO DE PROXIMIDADE) ---
export const startTrip = asyncHandler(async (req, res) => {
    const { lineId, lat, lng } = req.body;
    if (!lineId || !lat || !lng) {
        res.status(400);
        throw new Error("Todos os campos são obrigatórios");
    }
    const line = await Line.findById(lineId);
    if (!line) {
        res.status(404);
        throw new Error("Linha não encontrada");
    }
    if (!req.user || (req.user.role !== "driver" && req.user.role !== "admin")) {
        res.status(403);
        throw new Error("Usuário não autorizado ou não logado");
    }
    const existingTrip = await Trip.findOne({ driver: req.user.id, isActive: true });
    if (existingTrip) {
        res.status(400);
        throw new Error(`Usuário já possui uma viagem ativa: ${existingTrip.id}`);
    }

    const MAX_DISTANCE_FROM_ROUTE_METERS = 70; 
    if (!line.routePath || line.routePath.coordinates.length < 2) {
        res.status(400);
        throw new Error("Esta linha não possui uma rota válida definida.");
    }
    const driverPosition = turf.point([lng, lat]);
    const routeLineString = turf.lineString(line.routePath.coordinates);
    const snapped = turf.nearestPointOnLine(routeLineString, driverPosition);
    const distanceFromRoute = turf.distance(driverPosition, snapped.geometry.coordinates, { units: 'meters' });

    if (distanceFromRoute > MAX_DISTANCE_FROM_ROUTE_METERS) {
        res.status(400);
        throw new Error(`Você deve estar próximo da rota para iniciar a viagem. Você está a aproximadamente ${Math.round(distanceFromRoute)} metros de distância do percurso.`);
    }

    const now = new Date();
    const initialPosition = { type: 'Point', coordinates: [lng, lat], updatedAt: now };
    const distanceTraveledInitial = snapped.properties.location;
    
    const trip = await Trip.create({
        driver: req.user.id,
        line: lineId,
        currentPosition: initialPosition,
        lastPosition: initialPosition,
        distanceTraveled: distanceTraveledInitial,
        isOffRoute: false,
        stopsReached: [],
    });

    return res.status(201).json({ message: "Viagem iniciada com sucesso", trip: trip });
});


//@desc Update position on a trip
//@route PATCH /api/trips/:tripid/position
//@access private (driver, admin)
export const updatePosition = asyncHandler(async (req, res) => {
    const { tripId } = req.params;
    const { lat, lng } = req.body;
    if (!lat || !lng) {
        res.status(400);
        throw new Error('Latitude e longitude obrigatórias');
    }
    const trip = await Trip.findById(tripId).populate('line');
    if (!trip || !trip.isActive) {
        res.status(404);
        throw new Error('Viagem não encontrada ou finalizada');
    }
    if (trip.driver.toString() !== req.user.id) {
        res.status(403);
        throw new Error('Acesso negado');
    }

    const line = trip.line;
    const now = new Date();
    const newPosition = { type: 'Point', coordinates: [lng, lat], updatedAt: now };
    
    const MAX_DEVIATION_METERS = 70;
    const STOP_REACHED_RADIUS_METERS = 40;
    // Adicionado para evitar saltos para trás em rotas circulares
    const MAX_BACKWARD_JUMP_KILOMETERS = 0.5; // 500 metros

    const routeLineString = turf.lineString(line.routePath.coordinates);
    const snappedToRealPosition = turf.nearestPointOnLine(routeLineString, newPosition, { units: 'kilometers' });
    const deviationDistanceMeters = turf.distance(newPosition.coordinates, snappedToRealPosition.geometry.coordinates, { units: 'meters' });

    console.log(`[DEBUG] Desvio calculado: ${deviationDistanceMeters.toFixed(1)} metros.`);
    
    const isCurrentlyOffRoute = deviationDistanceMeters > MAX_DEVIATION_METERS;
    
    let justRecalibrated = false;

    if (isCurrentlyOffRoute) {
        trip.isOffRoute = true;
        trip.stopETAs = [];
    } else {
        // --- LÓGICA DE CÁLCULO DE DISTÂNCIA CORRIGIDA ---
        if (trip.isOffRoute) { // Se estava fora da rota, marca que acabou de recalibrar.
            justRecalibrated = true;
        }
        trip.isOffRoute = false;
        
        // Pega a distância ao longo da linha a partir do ponto projetado. Esta é a nova fonte da verdade.
        const newDistanceAlongRoute = snappedToRealPosition.properties.location;

        // VERIFICAÇÃO DE SANIDADE: Evita que a posição salte para um trecho anterior da rota.
        const distanceChange = newDistanceAlongRoute - trip.distanceTraveled;
        if (distanceChange >= -MAX_BACKWARD_JUMP_KILOMETERS) {
            // Se a mudança for para frente, ou um pequeno recuo (devido a imprecisão), atualiza.
            trip.distanceTraveled = newDistanceAlongRoute;
        } else {
            // Se saltou muito para trás, é provável que tenha projetado no trecho de "volta".
            // Ignoramos esta atualização de distância para evitar corromper o progresso.
            console.warn(`[WARN] Salto inválido para trás detectado. Distância não atualizada. De ${trip.distanceTraveled.toFixed(3)}km para ${newDistanceAlongRoute.toFixed(3)}km`);
        }
        // --- FIM DA CORREÇÃO ---

        for (const stop of line.stops) {
            const alreadyReached = trip.stopsReached.some(s => s.stopName === stop.name);
            if (alreadyReached) continue;

            // A lógica de "stop reached" continua a mesma, baseada na distância percorrida
            if (trip.distanceTraveled >= stop.distanceFromStart) {
                const physicalDistanceToStop = turf.distance(newPosition.coordinates, stop.location.coordinates, { units: 'meters' });

                if (physicalDistanceToStop <= STOP_REACHED_RADIUS_METERS) {
                    const lastReached = trip.stopsReached[trip.stopsReached.length - 1];
                    
                    if (lastReached && !justRecalibrated) {
                        const from = lastReached.stopName;
                        const to = stop.name;
                        const newDuration = (now - new Date(lastReached.reachedAt)) / 60000;
                        let etaRecord = await ETAHistory.findOne({ line: line._id, from, to });
                        if (etaRecord) {
                            const oldTotalDuration = etaRecord.averageDuration * etaRecord.sampleCount;
                            const newSampleCount = etaRecord.sampleCount + 1;
                            etaRecord.averageDuration = (oldTotalDuration + newDuration) / newSampleCount;
                            etaRecord.sampleCount = newSampleCount;
                        } else {
                            etaRecord = new ETAHistory({ line: line._id, from, to, averageDuration: newDuration, sampleCount: 1 });
                        }
                        await etaRecord.save();
                    }
                    
                    trip.stopsReached.push({ stopName: stop.name, reachedAt: now });
                    // CORREÇÃO ADICIONAL: Ao chegar em uma parada, recalibre a distância para a exata da parada.
                    // Isso corrige pequenos desvios acumulados entre as paradas.
                    trip.distanceTraveled = stop.distanceFromStart; 
                }
            }
        }

        const realTimeSpeedKmh = calculateRealTimeSpeed(trip.lastPosition, newPosition);
        trip.stopETAs = await calculateETAs(line, trip.distanceTraveled, realTimeSpeedKmh);
    }

    // A lógica de salvar e emitir continua a mesma
    trip.currentPosition = newPosition;
    // Para o cálculo da velocidade no próximo update, é melhor usar a posição atual real
    trip.lastPosition = trip.currentPosition;
    await trip.save();
    
    const distanceForAlong = Math.max(0, trip.distanceTraveled);
    const snappedPositionFeature = turf.along(routeLineString, distanceForAlong, { units: 'kilometers' });
    const snappedCoordinates = snappedPositionFeature.geometry.coordinates;

    const io = req.app.get('io');
    io.to(tripId).emit('positionUpdate', {
        rawPosition: trip.currentPosition.coordinates,
        snappedPosition: snappedCoordinates,
        stopETAs: trip.stopETAs,
        isOffRoute: trip.isOffRoute,
    });

    res.status(200).json({  
        message: 'Posição atualizada com sucesso',
        snappedPosition: snappedCoordinates,
        stopETAs: trip.stopETAs,
        isOffRoute: trip.isOffRoute
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
        throw new Error('Viagem não encontrada ou já finalizada');
    }
    if (trip.driver.toString() !== req.user.id) {
        res.status(403);
        throw new Error("Usuário não é o motorista desta viagem");
    }
    trip.isActive = false;
    await trip.save();
    const io = req.app.get('io');
    io.to(tripId).emit('tripEnded', { message: 'A viagem foi finalizada.' });
    return res.status(200).json({ message: "Viagem finalizada com sucesso." });
});

//@desc Get data from a trip, for the first time accessing the frontend. (after that it'll be sent by socket.io)
//@route GET /api/trips/:tripid/track
//@access public
export const getTripLiveData = asyncHandler(async (req, res) => {
    const { tripId } = req.params;
    const trip = await Trip.findById(tripId).populate('line');
    if (!trip || !trip.isActive) {
        res.status(404);
        throw new Error('Viagem não encontrada ou já finalizada');
    }
    
    // CORREÇÃO: Calcula a snappedPosition para a carga inicial
    const routeLineString = turf.lineString(trip.line.routePath.coordinates);
    const distanceForAlong = Math.max(0, trip.distanceTraveled);
    const snappedPositionFeature = turf.along(routeLineString, distanceForAlong, { units: 'kilometers' });

    return res.status(200).json({
        rawPosition: trip.currentPosition.coordinates, 
        snappedPosition: snappedPositionFeature.geometry.coordinates,
        stopETAs: trip.stopETAs,
        routePath: trip.line.routePath,
        stops: trip.line.stops,
        isOffRoute: trip.isOffRoute,
    });
});