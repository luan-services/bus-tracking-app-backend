import express from 'express';
import {
  getAllLines,
  getLineById,
  createLine
} from '../controllers/lineController.js';

import {validateJwtToken} from "../middleware/validateTokenHandler.js"

const router = express.Router();

router.route('/').get(getAllLines)

router.route('/').post(validateJwtToken, createLine);

router.route('/:id').get(getLineById);

export default router;