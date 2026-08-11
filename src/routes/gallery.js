import { Router } from 'express';
import { crudFactory } from '../controllers/crudFactory.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const c = crudFactory('gallery_images');

router.get('/', c.list);          // public
router.get('/:id', c.getOne);     // public
router.post('/', requireAuth, c.create);
router.put('/:id', requireAuth, c.update);
router.delete('/:id', requireAuth, c.remove);

export default router;
