import express from 'express';
import { getAllLines, getLineById, createLine } from '../controllers/lineController.js';

// importa o middleware de validação do JOI
import { validateJoiSchema } from "../middleware/validateJoiSchema.js";
// importa o schema do JOI
import { lineCreateSchema, lineSearchSchema } from '../models/joi_models/lineValidateModel.js';
// importa middleware de validação jwt
import { validateJwtToken } from "../middleware/validateTokenHandler.js"

const router = express.Router();

router.route('/').get(getAllLines)

router.route('/').post(validateJoiSchema(lineCreateSchema, "body"), validateJwtToken, createLine);

router.route('/:id').get(validateJoiSchema(lineSearchSchema, "params"), getLineById);

export default router;