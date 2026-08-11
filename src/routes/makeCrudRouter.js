import { Router } from 'express';
import { crudFactory } from '../controllers/crudFactory.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * Creates a standard REST router: GET /, GET /:id, POST /, PUT /:id, DELETE /:id
 * @param {string} table
 * @param {string} select
 * @param {boolean} protect - require auth for all routes (default true)
 */
export function makeCrudRouter(table, select = '*', protect = true) {
  const router = Router();
  const c = crudFactory(table, select);
  const guard = protect ? [requireAuth] : [];

  router.get('/', ...guard, c.list);
  router.get('/:id', ...guard, c.getOne);
  router.post('/', ...guard, c.create);
  router.put('/:id', ...guard, c.update);
  router.delete('/:id', ...guard, c.remove);

  return router;
}
