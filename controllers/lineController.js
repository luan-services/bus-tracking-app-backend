import asyncHandler from 'express-async-handler';
import Line from '../models/lineModel.js';

export const getAllLines = asyncHandler(async (req, res) => {
  const lines = await Line.find({});
  res.json(lines);
});

export const getLineById = asyncHandler(async (req, res) => {
  const line = await Line.findById(req.params.id);
  if (!line) {
    res.status(404);
    throw new Error('Linha não encontrada');
  }
  res.json(line);
});

export const createLine = asyncHandler(async (req, res) => {
  const line = new Line(req.body);
  const created = await line.save();
  res.status(201).json(created);
});