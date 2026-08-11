import { Router } from 'express';
import { crudFactory } from '../controllers/crudFactory.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const c = crudFactory('contact_messages');

router.post('/', c.create);       // public — website contact form
router.get('/', requireAuth, c.list);
router.get('/:id', requireAuth, c.getOne);
router.put('/:id', requireAuth, c.update);
router.delete('/:id', requireAuth, c.remove);

export default router;
