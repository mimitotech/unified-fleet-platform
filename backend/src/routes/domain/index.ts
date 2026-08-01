import { Router } from 'express';
import driversRouter from './drivers.js';
import routesRouter from './routes.js';
import fuelRouter from './fuel.js';
import workshopRouter from './workshop.js';
import emissionsRouter from './emissions.js';
import surveillanceRouter from './surveillance.js';
import geofencesRouter from './geofences.js';
import reportsRouter from './reports.js';
import commandsRouter from './commands.js';

const router = Router();

router.use('/drivers', driversRouter);
router.use('/routes', routesRouter);
router.use('/fuel', fuelRouter);
router.use('/workshop', workshopRouter);
router.use('/emissions', emissionsRouter);
router.use('/surveillance', surveillanceRouter);
router.use('/geofences', geofencesRouter);
router.use('/reports', reportsRouter);
router.use('/commands', commandsRouter);

export default router;
