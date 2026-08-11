import { Router } from 'express';
import { crudFactory } from '../controllers/crudFactory.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * For content the PUBLIC WEBSITE needs to read (facilities, offers, room types,
 * dining menu, hotel info, gallery…) but only ADMINS should be able to change.
 * GET routes are open. POST/PUT/DELETE require a valid staff session.
 */
export function makePublicReadRouter(table, select = '*') {
  const router = Router();
  const c = crudFactory(table, select);

  router.get('/', c.list);
  router.get('/:id', c.getOne);
  router.post('/', requireAuth, c.create);
  router.put('/:id', requireAuth, c.update);
  router.delete('/:id', requireAuth, c.remove);

  return router;
}
