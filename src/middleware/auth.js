import { supabase } from '../config/supabase.js';

// Verifies the Supabase access token sent as `Authorization: Bearer <token>`
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired token' });

    let profile = null;
    try {
      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();
      profile = p;
      if (profile?.role_id) {
        const { data: role } = await supabase.from('roles').select('name, slug, access_level').eq('id', profile.role_id).maybeSingle();
        if (role) profile.roles = role;
      }
    } catch {
      // safe fallback
    }

    req.user = data.user;
    req.profile = profile;
    next();
  } catch (err) {
    console.error('❌ [requireAuth Error]:', err.message || err);
    res.status(401).json({ error: err.message || 'Authentication failed' });
  }
}

// Restricts a route to a set of role slugs, e.g. requireRole('super_admin','hotel_manager')
export function requireRole(...allowedSlugs) {
  return (req, res, next) => {
    const slug = req.profile?.roles?.slug;
    if (!slug || !allowedSlugs.includes(slug)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    next();
  };
}

// Verifies the Supabase access token AND resolves it to a `guests` row via
// guests.auth_user_id. Used by every /api/me/* route in the Guest Portal.
// If the guest record doesn't exist yet, it automatically creates one so
// self-registered users or direct logins aren't locked out with 404s.
export async function requireGuest(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired token' });

    // 1. Try finding guest by auth_user_id
    let { data: guest } = await supabase
      .from('guests')
      .select('*')
      .eq('auth_user_id', data.user.id)
      .maybeSingle();

    // 2. If not found, try matching by email and link auth_user_id
    if (!guest && data.user.email) {
      const { data: byEmail } = await supabase
        .from('guests')
        .select('*')
        .eq('email', data.user.email)
        .maybeSingle();
      if (byEmail) {
        await supabase.from('guests').update({ auth_user_id: data.user.id }).eq('id', byEmail.id);
        guest = { ...byEmail, auth_user_id: data.user.id };
      }
    }

    // 3. If no guest record exists for this auth user, auto-provision one
    if (!guest) {
      const guestCode = `#GUEST-${Math.floor(Math.random() * 9000 + 1000)}`;
      const fullName =
        data.user.user_metadata?.full_name ||
        data.user.user_metadata?.name ||
        data.user.email?.split('@')[0] ||
        'Guest';

      const { data: newGuest, error: insertError } = await supabase
        .from('guests')
        .insert({
          auth_user_id: data.user.id,
          guest_code: guestCode,
          full_name: fullName,
          email: data.user.email,
        })
        .select()
        .single();

      if (!insertError && newGuest) {
        guest = newGuest;
      }
    }

    if (!guest) return res.status(404).json({ error: 'No guest profile found for this account' });

    req.user = data.user;
    req.guest = guest;
    next();
  } catch (err) {
    console.error('❌ [requireGuest Error]:', err.message || err);
    res.status(500).json({ error: err.message });
  }
}

