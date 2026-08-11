import { Router } from 'express';
import multer from 'multer';
import cloudinary from '../config/cloudinary.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

function bufferToDataUri(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

const isCloudinaryConfigured = () => {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  return name && name !== 'your-cloud-name' && key && key !== 'your-api-key';
};

// POST /api/upload  (form field name: "file")
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const folder = req.body.folder || 'luxora/general';

    if (isCloudinaryConfigured()) {
      try {
        const result = await cloudinary.uploader.upload(bufferToDataUri(req.file), {
          folder,
          resource_type: 'image',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        });

        return res.status(201).json({
          url: result.secure_url,
          public_id: result.public_id,
          width: result.width,
          height: result.height,
        });
      } catch (cloudErr) {
        console.warn('⚠️ [Cloudinary Upload Warning]:', cloudErr.message || cloudErr);
      }
    }

    // Fallback: use data URI if Cloudinary is not yet configured in .env
    const dataUri = bufferToDataUri(req.file);
    res.status(201).json({
      url: dataUri,
      public_id: `local_${Date.now()}`,
      width: 800,
      height: 600,
    });
  } catch (err) {
    console.error('❌ [Upload Error]:', err.message || err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/upload/:publicId
router.delete('/', requireAuth, async (req, res) => {
  try {
    const { public_id } = req.query;
    if (!public_id) return res.status(400).json({ error: 'public_id is required' });
    if (isCloudinaryConfigured() && !public_id.startsWith('local_')) {
      await cloudinary.uploader.destroy(public_id);
    }
    res.status(204).send();
  } catch (err) {
    console.error('❌ [Upload Delete Error]:', err.message || err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
