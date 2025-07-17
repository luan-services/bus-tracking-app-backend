import { ETAHistory } from '../models/etaHistoryModel.js';

// --- NOVO HELPER DE ETA (BASEADO APENAS EM HISTÓRICO) ---
/**
 * Calcula o ETA para todas as paradas futuras com base puramente no histórico de viagens.
 * @param {object} line - O objeto da linha, populado com as paradas.
 * @param {number} currentDistance - A distância atual do ônibus desde o início da rota em km.
 * @param {Array<object>} stopsReached - Um array com as paradas já alcançadas na viagem.
 * @returns {Array<{stopName: string, etaMinutes: number|null}>}
 */
export const calculateETAs = async (line, currentDistance, stopsReached) => {
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
