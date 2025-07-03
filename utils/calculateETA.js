import { ETAHistory } from '../models/etaHistoryModel.js';
import haversine from 'haversine-distance';

export const calculateETA = async (trip, line) => {
  if (!trip.currentPosition || !trip.currentPosition.coordinates) return [];

  const [lng, lat] = trip.currentPosition.coordinates;
  const currentPoint = { lat, lng };

  const stops = line.stops;
  const result = [];

  let found = false;

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const stopPoint = {
      lat: stop.location.coordinates[1],
      lng: stop.location.coordinates[0],
    };

    const distance = haversine(currentPoint, stopPoint); // em metros

    if (distance < 200 || found) { // considera próxima parada quando <200m ou depois
      found = true;

      let totalETA = 0;

      // Soma tempos médios entre stop[i] até stop[j]
      for (let j = i; j < stops.length - 1; j++) {
        const from = stops[j].name;
        const to = stops[j + 1].name;

        const record = await ETAHistory.findOne({
          line: line._id,
          from,
          to,
        });

        if (!record) {
          totalETA = null;
          break;
        }

        totalETA += record.averageDuration;
      }

      for (let j = i; j < stops.length; j++) {
        result.push({
          stopName: stops[j].name,
          etaMinutes: totalETA !== null ? Math.round(totalETA) : null,
        });

        if (totalETA !== null && j < stops.length - 1) {
          const from = stops[j].name;
          const to = stops[j + 1].name;

          const record = await ETAHistory.findOne({
            line: line._id,
            from,
            to,
          });

          if (record) totalETA -= record.averageDuration;
        }
      }

      break;
    }
  }

  return result;
};