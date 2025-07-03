import express from 'express';
import { startTrip, updatePosition, getTripLiveData, endTrip} from '../controllers/tripController.js';
import { validateJwtToken } from '../middleware/validateTokenHandler.js';

const router = express.Router();

router.post('/start', validateJwtToken, startTrip);

router.patch('/:tripId/position', validateJwtToken, updatePosition);

router.patch('/:tripId/end', validateJwtToken, endTrip);

router.get('/:tripId/track', getTripLiveData);

export default router;