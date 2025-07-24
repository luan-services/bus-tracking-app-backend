import express from 'express';
import { startTrip, updatePosition, getTripStatus, getTripLiveData, endTrip} from '../controllers/tripController.js';
import { validateJwtToken } from '../middleware/validateTokenHandler.js';
import { tripSearchSchema, positionUpdateSchema, tripCreateSchema } from '../models/joi_models/tripValidateModel.js';

// importa o middleware de validação do JOI
import { validateJoiSchema } from "../middleware/validateJoiSchema.js";

const router = express.Router();


router.post('/start',  validateJoiSchema(tripCreateSchema, "body"), validateJwtToken, startTrip);

router.patch('/:tripId/position', validateJoiSchema(tripSearchSchema, "params"),  validateJoiSchema(positionUpdateSchema, "body"), validateJwtToken, updatePosition);

router.patch('/:tripId/end', validateJoiSchema(tripSearchSchema, "params"), validateJwtToken, endTrip);


router.get('/user-status/', validateJwtToken, getTripStatus);

router.get('/:tripId/track', validateJoiSchema(tripSearchSchema, "params"), getTripLiveData);

export default router;