import { supabase } from '../config/supabase.js';

let cachedHotelId = null;
async function getDefaultHotelId() {
  if (cachedHotelId) return cachedHotelId;
  try {
    const { data, error } = await supabase.from('hotels').select('id').limit(1);
    if (!error && data && data.length > 0) {
      cachedHotelId = data[0].id;
      return cachedHotelId;
    }
    const { data: created, error: insertError } = await supabase.from('hotels').insert({
      name: 'Grand Luxora Hotel',
      slug: `grand-luxora-${Date.now()}`,
      city: 'Lagos',
      address: '123 Luxury Avenue, Victoria Island, Lagos, Nigeria',
    }).select('id');
    if (!insertError && created && created.length > 0) {
      cachedHotelId = created[0].id;
      return cachedHotelId;
    }
  } catch (err) {
    console.error('❌ [getDefaultHotelId Error]:', err.message || err);
  }
  return cachedHotelId;
}

const TABLES_WITH_HOTEL = [
  'rooms',
  'room_types',
  'rate_plans',
  'facilities',
  'dining_sections',
  'menu_items',
  'offers',
  'gallery_images',
];

async function sanitizePayload(table, raw) {
  const clean = { ...raw };

  // 1. Remove nested joined objects (e.g. `room_types: {...}`, `guests: {...}`) from join queries
  Object.keys(clean).forEach((key) => {
    if (clean[key] !== null && typeof clean[key] === 'object' && !Array.isArray(clean[key])) {
      delete clean[key];
    } else if (clean[key] === '' || clean[key] === 'undefined') {
      clean[key] = null;
    }
  });

  // 2. Remove read-only / metadata / Postgres generated columns
  delete clean.id;
  delete clean.created_at;
  delete clean.updated_at;
  delete clean.nights; // generated always as (check_out - check_in) stored

  // 3. Auto-attach default hotel_id if the table belongs to a hotel
  if (TABLES_WITH_HOTEL.includes(table) && !clean.hotel_id) {
    const hotelId = await getDefaultHotelId();
    if (hotelId) clean.hotel_id = hotelId;
  }

  // 4. Table-specific sensible defaults for Postgres NOT NULL columns
  if (table === 'facilities') {
    if (!clean.category) clean.category = 'General';
    if (!clean.status) clean.status = 'active';
    if (!clean.availability) clean.availability = 'available';
  } else if (table === 'rooms') {
    if (!clean.status) clean.status = 'active';
    if (!clean.availability) clean.availability = 'available';
  } else if (table === 'room_types') {
    if (!clean.base_rate) clean.base_rate = 0;
    if (!clean.max_adults) clean.max_adults = 2;
  } else if (table === 'offers') {
    if (!clean.type) clean.type = 'discount';
    if (!clean.status) clean.status = 'active';
  } else if (table === 'housekeeping_tasks') {
    if (!clean.status) clean.status = 'dirty';
    if (!clean.priority) clean.priority = 'low';
  }

  // 5. Safe numeric conversions for amount/rate fields
  if ('total_amount' in clean && clean.total_amount !== null) clean.total_amount = Number(clean.total_amount);
  if ('rate_override' in clean && clean.rate_override !== null) clean.rate_override = Number(clean.rate_override);
  if ('base_rate' in clean && clean.base_rate !== null) clean.base_rate = Number(clean.base_rate);
  if ('adults' in clean && clean.adults !== null) clean.adults = Number(clean.adults);
  if ('children' in clean && clean.children !== null) clean.children = Number(clean.children);

  return clean;
}

const TABLES_WITHOUT_CREATED_AT = ['dining_sections', 'dining_tables', 'menu_items'];

/**
 * Builds standard list/get/create/update/remove handlers for a Supabase table.
 * @param {string} table - table name
 * @param {string} select - columns / relations to select (default '*')
 */
export function crudFactory(table, select = '*') {
  return {
    async list(req, res) {
      try {
        const { page = 1, limit = 10, search, searchColumn, sortBy, sortDir = 'desc', ...filters } = req.query;
        const from = (Number(page) - 1) * Number(limit);
        const to = from + Number(limit) - 1;

        let query = supabase.from(table).select(select, { count: 'exact' });

        Object.entries(filters).forEach(([key, value]) => {
          if (value && value !== 'all') query = query.eq(key, value);
        });

        if (search && searchColumn) {
          query = query.ilike(searchColumn, `%${search}%`);
        }

        // Determine safe sort column
        const hasNoCreatedAt = TABLES_WITHOUT_CREATED_AT.includes(table);
        const sortField = sortBy || (hasNoCreatedAt ? (table === 'dining_tables' ? 'table_number' : 'name') : 'created_at');

        if (sortField) {
          query = query.order(sortField, { ascending: sortDir === 'asc' });
        }

        query = query.range(from, to);

        const { data, error, count } = await query;
        if (error) {
          console.error(`❌ [Supabase Error in ${table}]:`, error.message || error);
          throw error;
        }

        res.json({ data, total: count, page: Number(page), limit: Number(limit) });
      } catch (err) {
        console.error(`❌ [API Error in ${table}]:`, err.message || err);
        res.status(500).json({ error: err.message || 'Internal server error' });
      }
    },

    async getOne(req, res) {
      try {
        const { data, error } = await supabase.from(table).select(select).eq('id', req.params.id).single();
        if (error) throw error;
        res.json({ data });
      } catch (err) {
        res.status(404).json({ error: err.message });
      }
    },

    async create(req, res) {
      try {
        const payload = await sanitizePayload(table, req.body);
        console.log(`📝 [Creating in ${table}]:`, JSON.stringify(payload));
        const { data, error } = await supabase.from(table).insert(payload).select().single();
        if (error) {
          console.error(`❌ [Create Error in ${table}]:`, error.message || error);
          return res.status(400).json({ error: error.message || 'Failed to create record' });
        }
        res.status(201).json({ data });
      } catch (err) {
        console.error(`❌ [Create API Error in ${table}]:`, err.message || err);
        res.status(400).json({ error: err.message || 'Failed to create record' });
      }
    },

    async update(req, res) {
      try {
        const payload = await sanitizePayload(table, req.body);
        delete payload.id; // Avoid updating primary key id
        console.log(`📝 [Updating in ${table} (${req.params.id})]:`, JSON.stringify(payload));
        const { data, error } = await supabase
          .from(table)
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', req.params.id)
          .select()
          .single();
        if (error) {
          console.error(`❌ [Update Error in ${table}]:`, error.message || error);
          return res.status(400).json({ error: error.message || 'Failed to update record' });
        }
        res.json({ data });
      } catch (err) {
        console.error(`❌ [Update API Error in ${table}]:`, err.message || err);
        res.status(400).json({ error: err.message || 'Failed to update record' });
      }
    },

    async remove(req, res) {
      try {
        const { error } = await supabase.from(table).delete().eq('id', req.params.id);
        if (error) {
          console.error(`❌ [Delete Error in ${table}]:`, error.message || error);
          throw error;
        }
        res.status(204).send();
      } catch (err) {
        console.error(`❌ [Delete API Error in ${table}]:`, err.message || err);
        res.status(400).json({ error: err.message });
      }
    },
  };
}

