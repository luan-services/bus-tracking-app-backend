import { ETAHistory } from '../models/etaHistoryModel.js';

// --- NOVA FUNÇÃO HELPER ---
export const markStopAsReached = async (trip, stopToReach, line, timestamp) => {
    if (trip.stopsReached.some(s => s.stopName === stopToReach.name)) {
        
        return; 
    }

    const lastReachedStopRecord = trip.stopsReached[trip.stopsReached.length - 1];
    const fromStopName = lastReachedStopRecord ? lastReachedStopRecord.stopName : "START_OF_LINE";
    const fromStopTime = lastReachedStopRecord ? new Date(lastReachedStopRecord.reachedAt) : new Date(trip.startTime);
    const durationMinutes = (timestamp - fromStopTime) / 60000;

    // --- LÓGICA DE ATUALIZAÇÃO OTIMIZADA ---
    const key = { line: line._id, from: fromStopName, to: stopToReach.name };
    const etaRecord = await ETAHistory.findOne(key);

    if (etaRecord) {
        // Se o registro existe, calculamos a nova média em memória
        const oldTotalDuration = etaRecord.averageDuration * etaRecord.sampleCount;
        const newSampleCount = etaRecord.sampleCount + 1;
        etaRecord.averageDuration = (oldTotalDuration + durationMinutes) / newSampleCount;
        etaRecord.sampleCount = newSampleCount;
        // E salvamos o documento atualizado (1 escrita)
        await etaRecord.save();
    } else {
        // Se não existe, criamos um novo (1 escrita)
        await ETAHistory.create({ ...key, averageDuration: durationMinutes, sampleCount: 1 });
    }
    // --- FIM DA LÓGICA OTIMIZADA ---
    
    trip.stopsReached.push({ stopName: stopToReach.name, reachedAt: timestamp });
    trip.distanceTraveled = stopToReach.distanceFromStart;
};