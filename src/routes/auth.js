import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login  { email, password }
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });

    const { data: profile } = await supabase
      .from('profiles')
      .select('*, roles(name, slug, access_level)')
      .eq('id', data.user.id)
      .single();

    await supabase.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', data.user.id);

    res.json({ session: data.session, user: data.user, profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user, profile: req.profile });
});

// PUT /api/auth/profile — update staff profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { full_name, phone, avatar_url, department } = req.body;
    const updateData = {};
    if (full_name !== undefined) updateData.full_name = full_name;
    if (phone !== undefined) updateData.phone = phone;
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url;
    if (department !== undefined) updateData.department = department;
    updateData.updated_at = new Date().toISOString();

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', req.user.id)
      .maybeSingle();

    let updated;
    if (!existing) {
      const { data: inserted, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: req.user.id,
          email: req.user.email,
          full_name: full_name || req.user.user_metadata?.full_name || req.user.email?.split('@')[0] || 'Staff Administrator',
          phone: phone || null,
          avatar_url: avatar_url || null,
          department: department || 'Executive Management',
          updated_at: new Date().toISOString(),
        })
        .select('*, roles(name, slug, access_level)')
        .single();

      if (insertError) throw insertError;
      updated = inserted;
    } else {
      const { data: upd, error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', req.user.id)
        .select('*, roles(name, slug, access_level)')
        .single();

      if (updateError) throw updateError;
      updated = upd;
    }

    if (full_name) {
      await supabase.auth.admin.updateUserById(req.user.id, {
        user_metadata: { full_name, name: full_name },
      }).catch(() => {});
    }

    res.json({ profile: updated, message: 'Profile updated successfully' });
  } catch (err) {
    console.error('❌ [PUT /api/auth/profile Error]:', err.message || err);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  await supabase.auth.admin.signOut(req.headers.authorization.slice(7)).catch(() => {});
  res.status(204).send();
});

// POST /api/auth/users  — create a staff user (Super Admin / Hotel Manager only)
router.post('/users', requireAuth, requireRole('super_admin', 'hotel_manager'), async (req, res) => {
  try {
    const { email, password, full_name, role_id, department, phone } = req.body;
    const { data, error } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (error) throw error;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({ id: data.user.id, email, full_name, role_id, department, phone })
      .select()
      .single();
    if (profileError) throw profileError;

    res.status(201).json({ data: profile });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/guest-signup & /api/auth/register-guest — called after signup
const handleGuestSignup = async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) return res.status(401).json({ error: 'Invalid or expired token' });

    const { data: existing } = await supabase.from('guests').select('id').eq('auth_user_id', userData.user.id).maybeSingle();
    if (existing) return res.json({ data: existing });

    const { full_name, phone } = req.body;
    const fullName = full_name || userData.user.user_metadata?.full_name || userData.user.email?.split('@')[0] || 'Guest';

    const { data, error } = await supabase.from('guests').insert({
      auth_user_id: userData.user.id,
      guest_code: `#GUEST-${Math.floor(Math.random() * 9000 + 1000)}`,
      full_name: fullName,
      email: userData.user.email,
      phone,
    }).select().single();
    if (error) throw error;

    res.status(201).json({ data });
  } catch (err) {
    console.error('❌ [Guest Signup Error]:', err.message || err);
    res.status(400).json({ error: err.message });
  }
};

router.post('/guest-signup', handleGuestSignup);
router.post('/register-guest', handleGuestSignup);

export default router;

