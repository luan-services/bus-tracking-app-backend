import { Line } from '../models/lineModel.js';
import turf from '@turf/turf';

/**
 * Calcula e armazena o progresso e a distância de cada parada ao longo da rota de uma linha.
 * Deve ser executado uma vez quando a linha é criada ou atualizada.
 * @param {string} lineId - O ID da linha a ser processada.
 */
export const precalculateStopData = async (lineId) => {
  const line = await Line.findById(lineId);
  if (!line || !line.routePath?.coordinates) {
    throw new Error('Linha ou routePath não encontrado.');
  }

  const routeLineString = turf.lineString(line.routePath.coordinates);
  
  const totalDistance = turf.length(routeLineString, { units: 'kilometers' });

  for (const stop of line.stops) {
    const stopPoint = turf.point(stop.location.coordinates);
    const snapped = turf.nearestPointOnLine(routeLineString, stopPoint, { units: 'kilometers' });

    // location é a distância percorrida ao longo da linha até o ponto mais próximo
    const distanceFromStart = snapped.properties.location;
    const stopProgress = distanceFromStart / totalDistance;

    stop.distanceFromStart = distanceFromStart;
    stop.stopProgress = stopProgress;
  }

  await line.save();
  console.log(`Dados de parada pré-calculados para a linha: ${line.name}`);
};