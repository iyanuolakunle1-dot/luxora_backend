import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const [{ count: totalHotels }, { count: totalUsers }, { count: totalGuests }, bookingStats, roomOccupancy] = await Promise.all([
      supabase.from('hotels').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('guests').select('*', { count: 'exact', head: true }),
      supabase.from('v_booking_stats').select('*').maybeSingle(),
      supabase.from('v_room_occupancy').select('*').maybeSingle(),
    ]);

    const occupancyRate = roomOccupancy.data?.total_rooms
      ? Math.round(((roomOccupancy.data.total_rooms - roomOccupancy.data.available_rooms) / roomOccupancy.data.total_rooms) * 1000) / 10
      : 0;

    res.json({
      totalHotels: totalHotels || 0,
      totalUsers: totalUsers || 0,
      totalGuests: totalGuests || 0,
      totalBookings: bookingStats.data?.total_bookings || 0,
      totalRevenue: bookingStats.data?.total_revenue || 0,
      occupancyRate,
      rooms: roomOccupancy.data || {},
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ---------------------------------------------------------------------
// GET /api/dashboard/charts — real aggregates for the dashboard charts.
// No hardcoded numbers: revenue-by-day and bookings-by-source are computed
// directly from the `bookings` table for the last 7 days.
// ---------------------------------------------------------------------
router.get('/charts', requireAuth, async (req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 6);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('check_in, total_amount, payment_status, source, status')
      .gte('check_in', sinceStr);
    if (error) throw error;

    // Revenue by day (last 7 days, paid bookings only)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(since); d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const revenueByDay = days.map((day) => ({
      label: new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: bookings.filter((b) => b.check_in === day && b.payment_status === 'paid').reduce((sum, b) => sum + Number(b.total_amount || 0), 0),
    }));

    // Bookings by source
    const sourceCounts = {};
    bookings.filter((b) => b.status !== 'cancelled').forEach((b) => {
      const key = b.source || 'direct';
      sourceCounts[key] = (sourceCounts[key] || 0) + 1;
    });
    const bookingsBySource = Object.entries(sourceCounts).map(([name, value]) => ({ name, value }));

    res.json({ revenueByDay, bookingsBySource });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
