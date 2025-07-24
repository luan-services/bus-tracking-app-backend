import asyncHandler from 'express-async-handler';

import { Trip } from '../models/tripModel.js';
import { Line } from '../models/lineModel.js';

import { calculateETAs } from '../utils/calculateETAs.js';
import { markStopAsReached } from '../utils/markStopAsReached.js';

import * as turf from '@turf/turf';

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

    const now = new Date();
    const initialPosition = { type: 'Point', coordinates: [lng, lat], updatedAt: now };
   

    if (distanceFromRoute > MAX_DISTANCE_FROM_ROUTE_METERS) {
        res.status(400);
        throw new Error(`Você deve estar próximo da rota para iniciar a viagem. Distância: ${Math.round(distanceFromRoute)} metros.`);
    }

    // A distância inicial é a distância do ponto de início na rota.
    const distanceTraveledInitial = snapped.properties.location;
    
    const trip = await Trip.create({
        driver: req.user.id,
        line: lineId,
        currentPosition:  initialPosition,
        distanceTraveled: distanceTraveledInitial,
        lastPosition:  initialPosition, // Garante que lastPosition nunca seja nulo
    });

    return res.status(201).json({ message: "Viagem iniciada com sucesso", trip: trip });
});

//@desc Get status if user has an active trip
//@route GET /api/trips/user-status/
//@access private (driver, admin)
// --- CONTROLLER startTrip (COM VALIDAÇÃO DE PROXIMIDADE) ---
export const getTripStatus = asyncHandler(async (req, res) => {
    if (!req.user || (req.user.role !== "driver" && req.user.role !== "admin")) {
        res.status(403);
        throw new Error("Usuário não autorizado.");
    }
    const existingTrip = await Trip.findOne({ driver: req.user.id, isActive: true });
    if (existingTrip) {
        return res.status(200).json({ message: "Usuário possui uma trip ativa", trip_id: existingTrip.id });
    } else {
        return res.status(201).json({ message: "Usuário não possui trip ativa" });
    }
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
    const MAX_SPEED_MPS = 30; // velocidade máxima 108 km/h 
    const MAX_BACK_JUMP_METERS = -50

    const lastUpdateTime = new Date(trip.currentPosition.updatedAt || trip.startTime);
    const timeDiffSeconds = (now.getTime() - lastUpdateTime.getTime()) / 1000;
    
    const allowedJumpMeters = Math.max(500, MAX_SPEED_MPS * timeDiffSeconds); // se a atualização é feita a cada 5s só permite um salto de 150m

    // versão com apenas distancia const MAX_JUMP_METERS = 500; // Um salto de 500m em 5s é muito improvável.
    // versão com apenas distancia (deixa passar mais casos de teste) const allowedJumpMeters = Math.abs(distanceChange * 1000) > MAX_JUMP_METERS

    // Se a mudança for negativa ou excessivamente grande, ignoramos a atualização de progresso.
    // Isso é uma heurística para evitar o salto para o trecho de volta prematuramente.
    const isAnUnlikelyJump = Math.abs(distanceChange * 1000) > allowedJumpMeters || distanceChange * 1000 < MAX_BACK_JUMP_METERS ;
    
    if (!isAnUnlikelyJump) {

        // 1. PRIMEIRO, atualizamos o estado da viagem com a nova distância.
        trip.distanceTraveled = newDistanceTraveled;

        const newlyReachedStops = [];
        // --- VERIFICAÇÃO DE PARADAS ALCANÇADAS ---
        const STOP_REACHED_RADIUS_METERS = 40;

        for (const stop of line.stops) {
            const alreadyReached = trip.stopsReached.some(s => s.stopName === stop.name);
            if (alreadyReached) continue;

            // Condição 1: O progresso na rota ultrapassou a marca da parada?
            if (trip.distanceTraveled >= stop.distanceFromStart) {
                let wasReached = false;
                
                // Verificação de proximidade física
                const physicalDistanceToStop = turf.distance(newPosition.coordinates, stop.location.coordinates, { units: 'meters' });
                if (physicalDistanceToStop <= STOP_REACHED_RADIUS_METERS) {
                    console.log(`Parada ${stop.name} reached em ${newPosition.coordinates} proximidade fisica`)
                    wasReached = true;
                } 
                // Verificação de fallback (caminho cruzou a área da parada) (com fallback em caso de pular paradas, garante que todos
                // os etahistories vão ser calculados, ex: b->c c->d, porém os tempos serão engansos, sem o fallback, caso ocorra um salto
                // o eta vai ser só de b->d, porém realista)
                else if (trip.lastPosition?.coordinates) {
                    const lastCoords = trip.lastPosition.coordinates;
                    const newCoords = newPosition.coordinates;
                    // CORREÇÃO ESSENCIAL: Previne o erro da "linha de comprimento zero"
                    if (lastCoords[0] !== newCoords[0] || lastCoords[1] !== newCoords[1]) {
                        // CORREÇÃO ESSENCIAL: Garante um array puro para o Turf.js
                        const movementSegment = turf.lineString([[...lastCoords], newCoords]);
                        const stopPoint = turf.point(stop.location.coordinates);
                        
                        const distanceFromStopToPath = turf.pointToLineDistance(stopPoint, movementSegment, { units: 'meters' });
                        console.log(`Checando se ${stop.name} esta no range de ${newPosition.coordinates} <- ${trip.lastPosition.coordinates}`)
                        if (distanceFromStopToPath <= 40) {
                            wasReached = true;
                            console.log(`Parada ${stop.name} esta no range de ${newPosition.coordinates} <- ${trip.lastPosition.coordinates} e fisicamente proximo ao mov segment`)
                        }
                    }
                }

                if (wasReached) {
                    newlyReachedStops.push(stop);
                }
            }
        }
        
        // para impede de processar duas paradas ou mais por updatePosition, mude para === 1
       if (newlyReachedStops.length > 0 ) {
            newlyReachedStops.sort((a, b) => a.distanceFromStart - b.distanceFromStart);
            for (const stopToProcess of newlyReachedStops) {
                await markStopAsReached(trip, stopToProcess, line, now);
            }
        }

        // 1.  calculamos os ETAs com base no estado ATUAL da viagem.
        const stopETAs = await calculateETAs(line, newDistanceTraveled, trip.stopsReached);

        trip.stopETAs = stopETAs;
        trip.lastPosition = trip.currentPosition.toObject(); 
        trip.currentPosition = newPosition;
        // Salva a posição atual como a "última posição" para a próxima iteração
        await trip.save();

        // Posição para emitir no mapa (sempre "snapped" na rota, a menos que o salto seja detectado)
        const snappedPositionFeature = turf.along(routeLineString, trip.distanceTraveled, { units: 'kilometers' });
        const snappedCoordinates = snappedPositionFeature.geometry.coordinates;

        const totalRouteLength = turf.length(routeLineString, { units: 'kilometers' });


        const io = req.app.get('io');
        io.to(tripId).emit('positionUpdate', {
            rawPosition: trip.currentPosition.coordinates,
            snappedPosition: snappedCoordinates,
            stopETAs: trip.stopETAs,
            distanceTraveled: trip.distanceTraveled,
            stopsReached: trip.stopsReached.map(s => s.stopName),
            totalRouteLength: totalRouteLength 
        });

        return res.status(200).json({ 
            message: 'Posição atualizada.',
            snappedPosition: snappedCoordinates,
            stopETAs: trip.stopETAs,
        });

    } else {
        console.warn(`Salto de rota detectado. ${newPosition.coordinates} Mudança de ${distanceChange.toFixed(2)} km ignorada.`)

    }
    

    
        return res.status(200).json({ 
            message: 'Posição atualizada. (salto de rotas)',
            stopETAs: trip.stopETAs,
        });


});



//@desc End a trip
//@route PATCH /api/trips/:tripid/end
//@access private (driver, admin)
export const endTrip = asyncHandler(async (req, res) => {
    // Nenhuma alteração necessária aqui
    const { tripId } = req.params;
    const trip = await Trip.findById(tripId).populate('line');
    if (!trip || !trip.isActive) {
        res.status(404);
        throw new Error('Viagem não encontrada ou já finalizada');
    }
    if (trip.driver.toString() !== req.user.id) {
        res.status(403);
        throw new Error("Usuário não é o motorista desta viagem");
    }

    const line = trip.line;
    const lastStop = line.stops[line.stops.length - 1];

    if (lastStop) {
        const alreadyReached = trip.stopsReached.some(s => s.stopName === lastStop.name);
        // se a última parada ainda n foi marcada como reached
        if (!alreadyReached) {
            const physicalDistanceToLastStop = turf.distance(trip.currentPosition.coordinates, lastStop.location.coordinates, { units: 'meters' });
            console.log('ultima parada ainda nao reached')
            // Se o motorista está fisicamente perto da última parada ao finalizar...
            if (physicalDistanceToLastStop <= 40) { // Raio de 40m
                // ...marcamos ela como alcançada.
                const arrivalTimestamp = new Date(trip.currentPosition.updatedAt);
                await markStopAsReached(trip, lastStop, line, arrivalTimestamp);
                console.log('fisicamente perto e marcada marcada')
                console.log(lastStop.name)
            }

            const routeLineString = turf.lineString(line.routePath.coordinates);
            const totalRouteLength = turf.length(routeLineString, { units: 'kilometers' });
            const snappedPositionFeature = turf.along(routeLineString, trip.distanceTraveled, { units: 'kilometers' });
            //emite posição final
            const io = req.app.get('io');
            io.to(tripId).emit('positionUpdate', {
                rawPosition: trip.currentPosition.coordinates,
                snappedPosition: snappedPositionFeature.geometry.coordinates,
                stopETAs: [], // ETAs ficam vazios, pois a viagem acabou.
                distanceTraveled: trip.distanceTraveled,
                totalRouteLength: totalRouteLength,
                stopsReached: trip.stopsReached.map(s => s.stopName)
            });

        }
    }
    // se o motorista não esta perto da posição final ou esta perto mas a parada nao foi reached, nao emite nada e finaliza
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

    const totalRouteLength = turf.length(routeLineString, { units: 'kilometers' });


    return res.status(200).json({
        rawPosition: trip.currentPosition.coordinates, 
        snappedPosition: snappedPositionFeature.geometry.coordinates,
        stopETAs: trip.stopETAs,
        routePath: trip.line.routePath,
        stops: trip.line.stops,
        stopsReached: trip.stopsReached.map(s => s.stopName),
        distanceTraveled: trip.distanceTraveled,
        totalRouteLength: totalRouteLength
    });
});