import { Line } from '../models/lineModel.js';
import * as turf from '@turf/turf';

/**
 * Calcula e armazena o progresso e a distância de cada parada ao longo da rota de uma linha.
 * Deve ser executado uma vez quando a linha é criada ou atualizada.
 * @param {string} lineId - O ID da linha a ser processada.
 */
export const precalculateStopData = async (lineId) => {
  const line = await Line.findById(lineId);
  if (!line || !line.routePath?.coordinates || line.routePath.coordinates.length < 2) {
    console.warn(`Linha ${lineId} ou seu routePath é inválido para pré-cálculo.`);
    return;
  }

  const routeLineString = turf.lineString(line.routePath.coordinates);
  const totalDistance = turf.length(routeLineString, { units: 'kilometers' });

  if (totalDistance === 0) {
      console.warn(`A distância total da rota para a linha ${lineId} é 0.`);
      return;
  }

  for (const stop of line.stops) {
    const stopPoint = turf.point(stop.location.coordinates);
    const snapped = turf.nearestPointOnLine(routeLineString, stopPoint, { units: 'kilometers' });

    const distanceFromStart = snapped.properties.location;
    const stopProgress = distanceFromStart / totalDistance;

    stop.distanceFromStart = distanceFromStart;
    stop.stopProgress = stopProgress;
  }

  await line.save();
};