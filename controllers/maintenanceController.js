import asyncHandler from 'express-async-handler';
import Trip from '../models/tripModel.js';

// Remover trips encerradas há mais de 1 dia
export const deleteOldTrips = asyncHandler(async (req, res) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 1);

  const result = await Trip.deleteMany({
    isActive: false,
    updatedAt: { $lt: cutoff },
  });

  res.json({
    message: 'Viagens antigas removidas com sucesso',
    deletedCount: result.deletedCount,
  });
});

// Listar trips encerradas há mais de 1 dia (para download/exportação)
export const getOldTrips = asyncHandler(async (req, res) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 1);

  const trips = await Trip.find({
    isActive: false,
    updatedAt: { $lt: cutoff },
  }).populate('driver', 'name email').populate('line', 'lineNumber name');

  res.json(trips);
});