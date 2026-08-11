import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import uploadRoutes from './routes/upload.js';
import meRoutes from './routes/me.js';
import { makeCrudRouter } from './routes/makeCrudRouter.js';
import { makePublicReadRouter } from './routes/makePublicReadRouter.js';
import galleryRoutes from './routes/gallery.js';
import contactRoutes from './routes/contact.js';
import { supabase } from './config/supabase.js';
import { seedDatabase } from './utils/seedData.js';

dotenv.config();
const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'luxora-server' }));

// Manual seed trigger
app.post('/api/seed', async (req, res) => {
  try {
    await seedDatabase();
    res.json({ ok: true, message: 'Database seeded successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/me', meRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/contact-messages', contactRoutes);

// ---- PUBLIC-READ resources: the public website fetches these directly.  ----
app.use('/api/hotels',              makePublicReadRouter('hotels'));
app.use('/api/room-types',          makePublicReadRouter('room_types'));
app.use('/api/facilities',          makePublicReadRouter('facilities'));
app.use('/api/offers',              makePublicReadRouter('offers'));
app.use('/api/dining-sections',     makePublicReadRouter('dining_sections'));
app.use('/api/menu-items',          makePublicReadRouter('menu_items'));
app.use('/api/reviews',             makePublicReadRouter('reviews'));
app.use('/api/gallery',             galleryRoutes);

// ---- DIRECT ONLINE BOOKING: allows public visitors & guests to book online ----
app.post('/api/bookings/public-book', async (req, res) => {
  try {
    const { room_type_id, check_in, check_out, adults = 1, children = 0, full_name, email, phone, notes } = req.body;
    if (!room_type_id || !check_in || !check_out) {
      return res.status(400).json({ error: 'Room type, check-in, and check-out dates are required' });
    }

    const { data: rt, error: rtErr } = await supabase.from('room_types').select('*').eq('id', room_type_id).single();
    if (rtErr || !rt) return res.status(404).json({ error: 'Room type not found' });

    let guestId = null;
    let authUserId = null;
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      const { data: userData } = await supabase.auth.getUser(token);
      if (userData?.user) {
        authUserId = userData.user.id;
        const { data: g } = await supabase.from('guests').select('id').eq('auth_user_id', userData.user.id).maybeSingle();
        if (g) guestId = g.id;
      }
    }

    if (!guestId && email) {
      const { data: existingGuest } = await supabase.from('guests').select('id, auth_user_id').eq('email', email).maybeSingle();
      if (existingGuest) {
        guestId = existingGuest.id;
        if (authUserId && !existingGuest.auth_user_id) {
          await supabase.from('guests').update({ auth_user_id: authUserId }).eq('id', guestId);
        }
      } else {
        const { data: newG } = await supabase.from('guests').insert({
          auth_user_id: authUserId,
          guest_code: `#GUEST-${Math.floor(Math.random() * 9000 + 1000)}`,
          full_name: full_name || email.split('@')[0],
          email,
          phone,
        }).select().single();
        if (newG) guestId = newG.id;
      }
    }

    const { data: availableRoom } = await supabase
      .from('rooms')
      .select('id')
      .eq('room_type_id', room_type_id)
      .eq('availability', 'available')
      .limit(1)
      .maybeSingle();

    const inDate = new Date(check_in);
    const outDate = new Date(check_out);
    const diffMs = outDate.getTime() - inDate.getTime();
    const nights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const totalAmount = nights * Number(rt.base_rate || 0);

    const reservationCode = `#RES-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000 + 10000)}`;

    const { data: booking, error: bookErr } = await supabase.from('bookings').insert({
      reservation_code: reservationCode,
      hotel_id: rt.hotel_id,
      guest_id: guestId,
      room_id: availableRoom?.id || null,
      room_type_id,
      check_in,
      check_out,
      adults: Number(adults),
      children: Number(children),
      total_amount: totalAmount,
      status: 'confirmed',
      payment_status: 'paid',
      source: 'direct_website',
      notes,
    }).select().single();

    if (bookErr) throw bookErr;

    res.status(201).json({ data: booking, message: 'Reservation confirmed successfully!' });
  } catch (err) {
    console.error('❌ [Public Booking Error]:', err.message || err);
    res.status(400).json({ error: err.message || 'Failed to complete reservation' });
  }
});

// ---- STAFF-ONLY resources: operational data, never exposed publicly.    ----
app.use('/api/rooms',               makeCrudRouter('rooms', '*, room_types(name, base_rate)'));
app.use('/api/rate-plans',          makeCrudRouter('rate_plans'));
app.use('/api/guests',              makeCrudRouter('guests'));
app.use('/api/bookings',            makeCrudRouter('bookings', '*, guests(full_name, email), rooms(room_number), room_types(name)'));
app.use('/api/housekeeping',        makeCrudRouter('housekeeping_tasks', '*, rooms(room_number, floor), profiles(full_name)'));
app.use('/api/dining-orders',       makeCrudRouter('dining_orders', '*, dining_tables(table_number)'));
app.use('/api/roles',               makeCrudRouter('roles'));
app.use('/api/users',               makeCrudRouter('profiles', '*, roles(name, slug)'));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('🔥 [Global Error Handler]:', err);
  res.status(500).json({ error: err?.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Luxora API running on http://localhost:${PORT}`);
  // Automatically ensure database is populated with initial 5-star property data
  await seedDatabase();
});
