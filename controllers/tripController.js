import asyncHandler from 'express-async-handler';
import Trip from '../models/tripModel.js';
import Line from '../models/lineModel.js';
import { calculateETA } from '../utils/calculateETA.js';
import haversine from 'haversine-distance';
import ETAHistory from '../models/etaHistoryModel.js';

// Iniciar uma nova viagem (motorista)
export const startTrip = asyncHandler(async (req, res) => { /////////////// EDITEI ISSO AQUI PELO GEMINI TENHO Q AVISAR O GPT
  const { lineId, lat, lng } = req.body;

  if (!lat || !lng) {
    res.status(400);
    throw new Error('Latitude e longitude são obrigatórias');
  }

  const line = await Line.findById(lineId);
  if (!line) {
    res.status(404);
    throw new Error('Linha não encontrada');
  }

  if (!req.user) {
    res.status(404);
    throw new Error('Linha não encontrada');
  }

  const trip = await Trip.create({
    driver: req.user.id,
    line: lineId,
    currentPosition: { /////////////// INCLUI ISSO AQUI PELO GEMINI TENHO Q AVISAR O GPT
      type: 'Point',
      coordinates: [lng, lat], // Lembre-se: [longitude, latitude]
    },
  });

  res.status(201).json(trip);
});

// Atualizar posição do ônibus
export const updatePosition = asyncHandler(async (req, res) => {
  const { tripId } = req.params;
  const { lat, lng } = req.body;

  const trip = await Trip.findById(tripId);
  if (!trip || !trip.isActive) {
    res.status(404);
    throw new Error('Viagem não encontrada ou já encerrada');
  }

  trip.currentPosition = {
    type: 'Point',
    coordinates: [lng, lat],
    updatedAt: new Date(),
  };

  
  const line = await Line.findById(trip.line);
  trip.stopETAs = await calculateETA(trip, line);

    console.log(line.stops)
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
  

  // ETA seria calculado aqui no futuro
  await trip.save();

  const io = req.app.get('io');

  io.to(tripId).emit('positionUpdate', {
    coordinates: trip.currentPosition.coordinates,
    stopETAs: trip.stopETAs,
  });

  res.json({ message: 'Posição atualizada com sucesso' });
});

// Encerrar viagem
export const endTrip = asyncHandler(async (req, res) => {
  const { tripId } = req.params;

  const trip = await Trip.findById(tripId);
  if (!trip || !trip.isActive) {
    res.status(404);
    throw new Error('Viagem não encontrada ou já encerrada');
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
        const newAvg =
          (existing.averageDuration * existing.sampleCount + duration) /
          (existing.sampleCount + 1);
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

  res.json({ message: 'Viagem encerrada e ETAHistory atualizado.' });
});

// Dados para o frontend (tracking)
export const getTripLiveData = asyncHandler(async (req, res) => {
  const { tripId } = req.params;

  const trip = await Trip.findById(tripId).populate('line');
  if (!trip || !trip.isActive) {
    res.status(404);
    throw new Error('Viagem não encontrada ou encerrada');
  }

  res.json({
    currentPosition: trip.currentPosition,
    stopETAs: trip.stopETAs,
    routePath: trip.line.routePath,
    stops: trip.line.stops,
  });
});