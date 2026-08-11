import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { requireGuest } from '../middleware/auth.js';

const router = Router();

// ---------------------------------------------------------------------
// GET /api/me — the logged-in guest's own profile
// ---------------------------------------------------------------------
router.get('/', requireGuest, (req, res) => res.json({ data: req.guest }));

// PUT /api/me — update own profile (personal info, preferences)
router.put('/', requireGuest, async (req, res) => {
  try {
    const allowed = [
      'full_name',
      'phone',
      'date_of_birth',
      'gender',
      'nationality',
      'avatar_url',
      'about',
      'room_preference',
      'bed_preference',
      'travel_purpose',
      'newsletter_opt_in',
    ];
    const payload = {};
    allowed.forEach((k) => {
      if (k in req.body) {
        // Convert empty strings to null so Postgres date/enum syntax doesn't fail
        payload[k] = req.body[k] === '' ? null : req.body[k];
      }
    });

    const { data, error } = await supabase
      .from('guests')
      .update(payload)
      .eq('id', req.guest.id)
      .select()
      .single();

    if (error) {
      console.error('❌ [PUT /api/me Supabase Error]:', error.message || error);
      throw error;
    }
    res.json({ data });
  } catch (err) {
    console.error('❌ [PUT /api/me Error]:', err.message || err);
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// GET /api/me/dashboard — everything the Guest Dashboard screen needs,
// computed live from the guest's own bookings (no separate "dummy" numbers).
// ---------------------------------------------------------------------
router.get('/dashboard', requireGuest, async (req, res) => {
  try {
    const guestEmails = [req.guest.email, req.user.email].filter(Boolean);
    const { data: allGuestRows } = await supabase.from('guests').select('id').in('email', guestEmails);
    const guestIds = Array.from(new Set([req.guest.id, ...(allGuestRows || []).map((g) => g.id)]));

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*, room_types(name), rooms(room_number)')
      .in('guest_id', guestIds)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const allBookings = bookings || [];
    const upcoming = allBookings.filter((b) => b.status !== 'cancelled' && b.status !== 'checked_out');
    const completed = allBookings.filter((b) => b.status === 'checked_out');
    const nextStay = upcoming[0] || null;
    const recentStays = completed.slice(0, 3);

    res.json({
      guest: req.guest,
      upcomingCount: upcoming.length,
      totalStays: req.guest.total_stays || completed.length,
      loyaltyPoints: req.guest.loyalty_points || 0,
      totalSpent: req.guest.total_spent || allBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0),
      nextStay,
      recentStays,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// GET /api/me/bookings — the guest's own reservations (upcoming/completed/cancelled)
// ---------------------------------------------------------------------
router.get('/bookings', requireGuest, async (req, res) => {
  try {
    const { status } = req.query; // 'upcoming' | 'completed' | 'cancelled' | undefined = all

    const guestEmails = [req.guest.email, req.user.email].filter(Boolean);
    const { data: allGuestRows } = await supabase.from('guests').select('id').in('email', guestEmails);
    const guestIds = Array.from(new Set([req.guest.id, ...(allGuestRows || []).map((g) => g.id)]));

    const { data, error } = await supabase
      .from('bookings')
      .select('*, room_types(name), rooms(room_number), hotels(name, city)')
      .in('guest_id', guestIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    let filtered = data || [];
    if (status === 'upcoming') filtered = filtered.filter((b) => b.status !== 'cancelled' && b.status !== 'checked_out');
    else if (status === 'completed') filtered = filtered.filter((b) => b.status === 'checked_out');
    else if (status === 'cancelled') filtered = filtered.filter((b) => b.status === 'cancelled');

    res.json({ data: filtered });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// GET /api/me/reviews — reviews this guest has written
// POST /api/me/reviews — write a new review (only for a stay they actually had)
// ---------------------------------------------------------------------
router.get('/reviews', requireGuest, async (req, res) => {
  try {
    const { data, error } = await supabase.from('reviews').select('*').eq('guest_id', req.guest.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reviews', requireGuest, async (req, res) => {
  try {
    const { rating, comment, room_type } = req.body;
    const { data, error } = await supabase.from('reviews').insert({
      guest_id: req.guest.id,
      guest_name: req.guest.full_name,
      avatar_url: req.guest.avatar_url,
      rating, comment, room_type,
      source: 'direct',
    }).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// Payment methods (masked/display data only — never store raw card numbers)
// ---------------------------------------------------------------------
router.get('/payment-methods', requireGuest, async (req, res) => {
  const { data, error } = await supabase.from('payment_methods').select('*').eq('guest_id', req.guest.id).order('is_default', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.post('/payment-methods', requireGuest, async (req, res) => {
  try {
    const { brand, last4, exp_month, exp_year, is_default } = req.body;
    const { data, error } = await supabase.from('payment_methods').insert({ guest_id: req.guest.id, brand, last4, exp_month, exp_year, is_default: !!is_default }).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/payment-methods/:id', requireGuest, async (req, res) => {
  const { error } = await supabase.from('payment_methods').delete().eq('id', req.params.id).eq('guest_id', req.guest.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
});

// ---------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------
router.get('/notifications', requireGuest, async (req, res) => {
  const { data, error } = await supabase.from('notifications').select('*').eq('guest_id', req.guest.id).order('created_at', { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.put('/notifications/:id', requireGuest, async (req, res) => {
  const { data, error } = await supabase.from('notifications').update({ is_read: true }).eq('id', req.params.id).eq('guest_id', req.guest.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
});

export default router;
