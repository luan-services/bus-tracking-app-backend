import express from 'express';
import { deleteOldTrips, getOldTrips } from '../controllers/maintenanceController.js';
import { validateJwtToken } from '../middleware/validateTokenHandler.js';

const router = express.Router();

router.post('/delete-trips', validateJwtToken, deleteOldTrips);

router.get('/old-trips', validateJwtToken, getOldTrips);

export default router;