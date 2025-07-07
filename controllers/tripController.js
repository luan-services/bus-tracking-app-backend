import asyncHandler from 'express-async-handler';

import { Trip } from '../models/tripModel.js';
import { Line } from '../models/lineModel.js';

import { ETAHistory } from '../models/etaHistoryModel.js';

import * as turf from '@turf/turf';

// --- NOVO HELPER DE ETA (BASEADO APENAS EM HISTÓRICO) ---
/**
 * Calcula o ETA para todas as paradas futuras com base puramente no histórico de viagens.
 * @param {object} line - O objeto da linha, populado com as paradas.
 * @param {number} currentDistance - A distância atual do ônibus desde o início da rota em km.
 * @param {Array<object>} stopsReached - Um array com as paradas já alcançadas na viagem.
 * @returns {Array<{stopName: string, etaMinutes: number|null}>}
 */
const calculateETAs = async (line, currentDistance, stopsReached) => {
    // 1. Busca todo o histórico para a linha e o mapeia para acesso rápido.
    const allEtaRecords = await ETAHistory.find({ line: line._id });
    const etaHistoryMap = new Map();
    allEtaRecords.forEach(record => {
        etaHistoryMap.set(`${record.from}->${record.to}`, record);
    });

    // 2. Filtra as paradas que ainda não foram alcançadas.
    const upcomingStops = line.stops.filter(stop => stop.distanceFromStart > currentDistance);
    if (upcomingStops.length === 0) return [];

    const etas = [];
    let cumulativeTime = 0;
    let historyIsAvailable = true; // Flag para rastrear a disponibilidade do histórico.

    // 3. Encontra a última parada alcançada para determinar o segmento atual.
    const lastReachedStop = stopsReached.length > 0 ? line.stops.find(s => s.name === stopsReached[stopsReached.length - 1].stopName) : null;
    const firstUpcomingStop = upcomingStops[0];

    // 4. Calcula o tempo restante para a primeira parada futura.
    const fromStopName = lastReachedStop ? lastReachedStop.name : "START_OF_LINE";
    const fromStopDistance = lastReachedStop ? lastReachedStop.distanceFromStart : 0;
    const key = `${fromStopName}->${firstUpcomingStop.name}`;
    const firstSegmentRecord = etaHistoryMap.get(key);

    if (firstSegmentRecord?.averageDuration) {
        const segmentTotalDistance = firstUpcomingStop.distanceFromStart - fromStopDistance;
        const progressInSegment = segmentTotalDistance > 0 ? (currentDistance - fromStopDistance) / segmentTotalDistance : 1;
        cumulativeTime += firstSegmentRecord.averageDuration * (1 - Math.min(1, progressInSegment)); // Garante que não seja negativo se houver imprecisão
    } else {
        historyIsAvailable = false; // Se o primeiro trecho não tem histórico, nenhum ETA pode ser calculado.
    }
    
    etas.push({ stopName: firstUpcomingStop.name, etaMinutes: historyIsAvailable ? Math.round(cumulativeTime) : null });

    // 5. Calcula o ETA para as paradas restantes, somando as durações dos trechos.
    for (let i = 0; i < upcomingStops.length - 1; i++) {
        const fromStop = upcomingStops[i];
        const toStop = upcomingStops[i + 1];
        const segmentKey = `${fromStop.name}->${toStop.name}`;
        const segmentRecord = etaHistoryMap.get(segmentKey);

        if (historyIsAvailable && segmentRecord?.averageDuration) {
            cumulativeTime += segmentRecord.averageDuration;
        } else {
            historyIsAvailable = false; // Se qualquer trecho subsequente falhar, o resto é nulo.
        }
        etas.push({ stopName: toStop.name, etaMinutes: historyIsAvailable ? Math.round(cumulativeTime) : null });
    }

    return etas;
};


////////////////

//@desc Start a trip
//@route POST /api/trips/start
//@access private (driver, admin)
// --- CONTROLLER startTrip (COM VALIDAÇÃO DE PROXIMIDADE) ---
export const startTrip = asyncHandler(async (req, res) => {
    const { lineId, lat, lng } = req.body;
    if (!lineId || lat === undefined || lng === undefined) {
        res.status(400);
        throw new Error("lineId, lat e lng são obrigatórios.");
    }
    const line = await Line.findById(lineId);
    if (!line) {
        res.status(404);
        throw new Error("Linha não encontrada");
    }
    if (!req.user || (req.user.role !== "driver" && req.user.role !== "admin")) {
        res.status(403);
        throw new Error("Usuário não autorizado.");
    }
    const existingTrip = await Trip.findOne({ driver: req.user.id, isActive: true });
    if (existingTrip) {
        res.status(400);
        throw new Error(`Usuário já possui uma viagem ativa: ${existingTrip.id}`);
    }

    // Valida se a linha tem uma rota e se o motorista está perto dela.
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
        throw new Error(`Você deve estar próximo da rota para iniciar a viagem. Distância: ${Math.round(distanceFromRoute)} metros.`);
    }

    // A distância inicial é a distância do ponto de início na rota.
    const distanceTraveledInitial = snapped.properties.location;
    
    const trip = await Trip.create({
        driver: req.user.id,
        line: lineId,
        currentPosition: { type: 'Point', coordinates: [lng, lat], updatedAt: new Date() },
        distanceTraveled: distanceTraveledInitial,
    });

    return res.status(201).json({ message: "Viagem iniciada com sucesso", trip: trip });
});


//@desc Update position on a trip
//@route PATCH /api/trips/:tripid/position
//@access private (driver, admin)
export const updatePosition = asyncHandler(async (req, res) => {
    const { tripId } = req.params;
    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined) {
        res.status(400).json({ message: 'Latitude e longitude obrigatórias' });
        return;
    }

    const trip = await Trip.findById(tripId).populate('line');
    if (!trip || !trip.isActive) {
        res.status(404).json({ message: 'Viagem não encontrada ou finalizada' });
        return;
    }
    if (trip.driver.toString() !== req.user.id) {
        res.status(403).json({ message: 'Acesso negado' });
        return;
    }

    const { line } = trip;
    const now = new Date();
    const newPosition = { type: 'Point', coordinates: [lng, lat], updatedAt: now };

    const routeLineString = turf.lineString(line.routePath.coordinates);
    const snappedToRoute = turf.nearestPointOnLine(routeLineString, newPosition.coordinates);
    const newDistanceTraveled = snappedToRoute.properties.location;

    // --- LÓGICA ANTI-SALTO PARA ROTAS SOBREPOSTAS ---
    // Impede que a posição "salte" para um ponto muito distante na rota (ex: da ida para a volta).
    const previousDistance = trip.distanceTraveled;
    const distanceChange = newDistanceTraveled - previousDistance;
    const MAX_JUMP_METERS = 750; // Um salto de 750m em 5s é muito improvável.
    
    // Se a mudança for negativa ou excessivamente grande, ignoramos a atualização de progresso.
    // Isso é uma heurística para evitar o salto para o trecho de volta prematuramente.
    const isAnUnlikelyJump = Math.abs(distanceChange * 1000) > MAX_JUMP_METERS;
    
    if (!isAnUnlikelyJump) {
        trip.distanceTraveled = newDistanceTraveled;

        // --- VERIFICAÇÃO DE PARADAS ALCANÇADAS ---
        const STOP_REACHED_RADIUS_METERS = 40;
        const newlyReachedStops = [];

        for (const stop of line.stops) {
            const alreadyReached = trip.stopsReached.some(s => s.stopName === stop.name);
            if (alreadyReached) continue;

            // Condição principal: o progresso na rota já ultrapassou a marca da parada?
            if (trip.distanceTraveled >= stop.distanceFromStart) {
                let wasReached = false;

                // TENTATIVA 1 (Verificação Rápida): O ponto atual do GPS está dentro do raio da parada?
                // Isso cobre 99% dos casos e é muito eficiente.
                const physicalDistanceToStop = turf.distance(newPosition.coordinates, stop.location.coordinates, { units: 'meters' });
                if (physicalDistanceToStop <= STOP_REACHED_RADIUS_METERS) {
                    wasReached = true;
                } 
                // TENTATIVA 2 (Verificação Robusta de Fallback): Se a verificação rápida falhou,
                // pode ser que o ônibus passou reto entre duas atualizações.
                // Verificamos se a RETA do movimento do ônibus cruzou a ÁREA da parada.
                else if (trip.lastPosition?.coordinates) {
                    const movementSegment = turf.lineString([trip.lastPosition.coordinates, newPosition.coordinates]);
                    const stopPoint = turf.point(stop.location.coordinates);
                    
                    // Calcula a menor distância entre o ponto da parada e a linha de movimento do ônibus.
                    const distanceFromStopToPath = turf.pointToLineDistance(stopPoint, movementSegment, { units: 'meters' });

                    if (distanceFromStopToPath <= STOP_REACHED_RADIUS_METERS) {
                         wasReached = true;
                    }
                }

                if (wasReached) {
                    newlyReachedStops.push(stop);
                }
            }
        }
        
        // Ordena as paradas recém-alcançadas pela distância (caso pule mais de uma)
        newlyReachedStops.sort((a, b) => a.distanceFromStart - b.distanceFromStart);

        for (const stop of newlyReachedStops) {
            // Encontra a parada anterior para calcular a duração do trecho
            const lastReachedStopRecord = trip.stopsReached[trip.stopsReached.length - 1];
            const fromStopName = lastReachedStopRecord ? lastReachedStopRecord.stopName : "START_OF_LINE";
            const fromStopTime = lastReachedStopRecord ? new Date(lastReachedStopRecord.reachedAt) : new Date(trip.startTime);
            
            // Atualiza o histórico de ETA
            const durationMinutes = (now - fromStopTime) / 60000;
            const key = { line: line._id, from: fromStopName, to: stop.name };
            
            const etaRecord = await ETAHistory.findOne(key);
            if (etaRecord) {
                const oldTotalDuration = etaRecord.averageDuration * etaRecord.sampleCount;
                const newSampleCount = etaRecord.sampleCount + 1;
                etaRecord.averageDuration = (oldTotalDuration + durationMinutes) / newSampleCount;
                etaRecord.sampleCount = newSampleCount;
                await etaRecord.save();
            } else {
                await ETAHistory.create({ ...key, averageDuration: durationMinutes, sampleCount: 1 });
            }

            trip.stopsReached.push({ stopName: stop.name, reachedAt: now });
            // "Calibra" a distância percorrida para o valor exato da parada para evitar acumulo de erros.
            trip.distanceTraveled = stop.distanceFromStart;
        }

        // --- CALCULA NOVOS ETAS ---
        trip.stopETAs = await calculateETAs(line, trip.distanceTraveled, trip.stopsReached);
    } else {
        console.warn("Salto entre rotas detectado!")
    }
    
    trip.currentPosition = newPosition;
    // Salva a posição atual como a "última posição" para a próxima iteração
    trip.lastPosition = trip.currentPosition;
    await trip.save();
    
    // Posição para emitir no mapa (sempre "snapped" na rota, a menos que o salto seja detectado)
    const snappedPositionFeature = turf.along(routeLineString, trip.distanceTraveled, { units: 'kilometers' });
    const snappedCoordinates = snappedPositionFeature.geometry.coordinates;

    const io = req.app.get('io');
    io.to(tripId).emit('positionUpdate', {
        rawPosition: trip.currentPosition.coordinates,
        snappedPosition: snappedCoordinates,
        stopETAs: trip.stopETAs,
        // isOffRoute não é mais o foco, mas podemos derivá-lo se necessário.
    });

    res.status(200).json({ 
        message: 'Posição atualizada.',
        snappedPosition: snappedCoordinates,
        stopETAs: trip.stopETAs,
    });
});







//@desc End a trip
//@route PATCH /api/trips/:tripid/end
//@access private (driver, admin)
export const endTrip = asyncHandler(async (req, res) => {
    // Nenhuma alteração necessária aqui
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
    // Nenhuma alteração necessária aqui
    const { tripId } = req.params;
    const trip = await Trip.findById(tripId).populate('line');
    if (!trip || !trip.isActive) {
        res.status(404);
        throw new Error('Viagem não encontrada ou já finalizada');
    }
    
    const routeLineString = turf.lineString(trip.line.routePath.coordinates);
    const distanceForAlong = Math.max(0, trip.distanceTraveled);
    const snappedPositionFeature = turf.along(routeLineString, distanceForAlong, { units: 'kilometers' });

    return res.status(200).json({
        rawPosition: trip.currentPosition.coordinates, 
        snappedPosition: snappedPositionFeature.geometry.coordinates,
        stopETAs: trip.stopETAs,
        routePath: trip.line.routePath,
        stops: trip.line.stops,
        stopsReached: trip.stopsReached.map(s => s.stopName),
    });
});