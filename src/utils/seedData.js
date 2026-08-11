import { supabase } from '../config/supabase.js';

export async function seedDatabase() {
  console.log('🌱 [Seeder]: Starting database seed...');

  try {
    // 1. Ensure Hotel
    let hotelId = null;
    const { data: existingHotels } = await supabase.from('hotels').select('id').limit(1);
    if (existingHotels && existingHotels.length > 0) {
      hotelId = existingHotels[0].id;
    } else {
      const { data: newHotel } = await supabase.from('hotels').insert({
        name: 'Grand Luxora Hotel & Resort',
        slug: 'grand-luxora-lagos',
        city: 'Victoria Island, Lagos',
        address: '123 Luxury Avenue, Victoria Island, Lagos, Nigeria',
        star_rating: 5,
        contact_email: 'reservations@luxora.com',
        contact_phone: '+234 810 123 4567',
        check_in_time: '14:00',
        check_out_time: '11:00',
      }).select('id').single();
      if (newHotel) hotelId = newHotel.id;
    }

    if (!hotelId) {
      console.error('❌ [Seeder]: Could not resolve hotel_id');
      return;
    }

    // 2. Seed Room Types
    const roomTypesData = [
      {
        hotel_id: hotelId,
        name: 'Deluxe King Room',
        description: 'Spacious room featuring a plush king-size bed, private marble bathroom, floor-to-ceiling city views, and high-speed Wi-Fi.',
        base_rate: 65000,
        max_adults: 2,
        max_children: 1,
        size_sqm: 42,
        amenities: ['Free Wi-Fi', 'King Bed', 'Air Conditioning', 'Smart TV', 'Mini Bar', 'Espresso Machine'],
        images: ['https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80'],
      },
      {
        hotel_id: hotelId,
        name: 'Executive Suite',
        description: 'Ultra-luxurious suite featuring a separate living room, dining area, walk-in closet, panoramic ocean views, and exclusive lounge access.',
        base_rate: 120000,
        max_adults: 3,
        max_children: 2,
        size_sqm: 75,
        amenities: ['Free Wi-Fi', 'Living Area', 'King Bed', 'Smart TV', 'Jacuzzi', 'Mini Bar', 'Lounge Access'],
        images: ['https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80'],
      },
      {
        hotel_id: hotelId,
        name: 'Presidential Penthouse Suite',
        description: 'The pinnacle of luxury. Top floor with 360-degree skyline views, private terrace, grand dining table, 24/7 butler service, and jacuzzi.',
        base_rate: 280000,
        max_adults: 4,
        max_children: 2,
        size_sqm: 150,
        amenities: ['Private Butler', 'Panoramic Views', 'Terrace', 'Jacuzzi', 'Smart TV', 'Private Bar'],
        images: ['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80'],
      },
      {
        hotel_id: hotelId,
        name: 'Ocean View Villa',
        description: 'Private detached villa surrounded by tropical gardens with direct beach access, private plunge pool, and sun deck.',
        base_rate: 195000,
        max_adults: 2,
        max_children: 1,
        size_sqm: 95,
        amenities: ['Private Pool', 'Beach Access', 'King Bed', 'Espresso Machine', 'Air Conditioning'],
        images: ['https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1200&q=80'],
      },
    ];

    const { data: existingRT } = await supabase.from('room_types').select('id, name');
    const existingRTNames = (existingRT || []).map((r) => r.name);
    const toInsertRT = roomTypesData.filter((r) => !existingRTNames.includes(r.name));
    if (toInsertRT.length > 0) {
      const { data: insertedRT } = await supabase.from('room_types').insert(toInsertRT).select();
      console.log(`✅ [Seeder]: Inserted ${insertedRT?.length || 0} room types`);
    }

    // Fetch all current room types for room assignments
    const { data: currentRoomTypes } = await supabase.from('room_types').select('id, name');
    const deluxeRT = currentRoomTypes?.find((r) => r.name.includes('Deluxe')) || currentRoomTypes?.[0];
    const execRT = currentRoomTypes?.find((r) => r.name.includes('Executive')) || currentRoomTypes?.[0];
    const presRT = currentRoomTypes?.find((r) => r.name.includes('Presidential')) || currentRoomTypes?.[0];

    // 3. Seed Rooms Inventory
    if (deluxeRT && execRT) {
      const roomsData = [
        { hotel_id: hotelId, room_number: '101', floor: '1', room_type_id: deluxeRT.id, status: 'active', availability: 'available' },
        { hotel_id: hotelId, room_number: '102', floor: '1', room_type_id: deluxeRT.id, status: 'active', availability: 'available' },
        { hotel_id: hotelId, room_number: '201', floor: '2', room_type_id: deluxeRT.id, status: 'active', availability: 'available' },
        { hotel_id: hotelId, room_number: '301', floor: '3', room_type_id: execRT.id, status: 'active', availability: 'available' },
        { hotel_id: hotelId, room_number: '302', floor: '3', room_type_id: execRT.id, status: 'active', availability: 'available' },
        { hotel_id: hotelId, room_number: '501', floor: '5', room_type_id: presRT?.id || execRT.id, status: 'active', availability: 'available' },
      ];

      const { data: existingRooms } = await supabase.from('rooms').select('room_number');
      const existingRoomNums = (existingRooms || []).map((r) => r.room_number);
      const toInsertRooms = roomsData.filter((r) => !existingRoomNums.includes(r.room_number));
      if (toInsertRooms.length > 0) {
        await supabase.from('rooms').insert(toInsertRooms);
        console.log(`✅ [Seeder]: Inserted ${toInsertRooms.length} rooms`);
      }
    }

    // 4. Seed Facilities
    const facilitiesData = [
      {
        hotel_id: hotelId,
        name: 'Infinity Horizon Pool',
        category: 'Recreation',
        location: 'Level 4 Rooftop',
        description: 'Heated infinity pool overlooking the city skyline with poolside cabanas, bar service, and sunset loungers.',
        image_url: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=1200&q=80',
        status: 'active',
        availability: 'available',
        guest_rating: 4.9,
      },
      {
        hotel_id: hotelId,
        name: 'Serena Wellness & Spa',
        category: 'Wellness',
        location: 'Ground Floor, East Wing',
        description: 'Full-service holistic spa offering aromatherapy massages, hydrotherapy, sauna, steam rooms, and bespoke skin treatments.',
        image_url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80',
        status: 'active',
        availability: 'available',
        guest_rating: 5.0,
      },
      {
        hotel_id: hotelId,
        name: 'Pulse Fitness & Gym Center',
        category: 'Fitness',
        location: 'Level 2',
        description: 'State-of-the-art gym equipped with Technogym machines, free weights, personal trainers, and panoramic garden views.',
        image_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80',
        status: 'active',
        availability: 'available',
        guest_rating: 4.8,
      },
      {
        hotel_id: hotelId,
        name: 'The Grand Ballroom & Executive Lounge',
        category: 'Events',
        location: 'Level 1, West Wing',
        description: 'Versatile event spaces for international conferences, gala dinners, and private board meetings with high-tech audiovisual setup.',
        image_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
        status: 'active',
        availability: 'available',
        guest_rating: 4.9,
      },
    ];

    const { data: existingFacilities } = await supabase.from('facilities').select('name');
    const existingFacNames = (existingFacilities || []).map((f) => f.name);
    const toInsertFac = facilitiesData.filter((f) => !existingFacNames.includes(f.name));
    if (toInsertFac.length > 0) {
      await supabase.from('facilities').insert(toInsertFac);
      console.log(`✅ [Seeder]: Inserted ${toInsertFac.length} facilities`);
    }

    // 5. Seed Special Offers
    const offersData = [
      {
        hotel_id: hotelId,
        title: 'Summer Luxury Escape',
        category: 'Seasonal',
        type: 'seasonal_offer',
        description: 'Enjoy 25% off all suites with complimentary daily buffet breakfast, ₦20,000 spa credit, and late check-out.',
        discount_percent: 25,
        valid_from: '2026-06-01',
        valid_to: '2026-09-30',
        status: 'active',
      },
      {
        hotel_id: hotelId,
        title: 'Romantic Couple Getaway',
        category: 'Romance',
        type: 'package',
        description: 'A bottle of premium champagne on arrival, 3-course candlelit dinner, couple massage, and luxury suite upgrade.',
        discount_percent: 30,
        valid_from: '2026-01-01',
        valid_to: '2026-12-31',
        status: 'active',
      },
      {
        hotel_id: hotelId,
        title: 'Weekend Staycation Special',
        category: 'Weekend',
        type: 'discount',
        description: 'Recharge your weekends with special discounted flat rates, free pool cabana access, and complimentary cocktail on arrival.',
        fixed_price: 85000,
        valid_from: '2026-01-01',
        valid_to: '2026-12-31',
        status: 'active',
      },
    ];

    const { data: existingOffers } = await supabase.from('offers').select('title');
    const existingOfferTitles = (existingOffers || []).map((o) => o.title);
    const toInsertOffers = offersData.filter((o) => !existingOfferTitles.includes(o.title));
    if (toInsertOffers.length > 0) {
      await supabase.from('offers').insert(toInsertOffers);
      console.log(`✅ [Seeder]: Inserted ${toInsertOffers.length} offers`);
    }

    // 6. Seed Dining Sections & Menu Items
    const sectionsData = [
      { hotel_id: hotelId, name: 'The Golden Leaf Fine Dining', capacity: 80, location: 'Level 1' },
      { hotel_id: hotelId, name: 'Skyline Rooftop Bar & Lounge', capacity: 120, location: 'Level 5 Rooftop' },
    ];
    const { data: existingSections } = await supabase.from('dining_sections').select('name');
    const existingSecNames = (existingSections || []).map((s) => s.name);
    const toInsertSec = sectionsData.filter((s) => !existingSecNames.includes(s.name));
    if (toInsertSec.length > 0) {
      await supabase.from('dining_sections').insert(toInsertSec);
    }

    const menuData = [
      {
        hotel_id: hotelId,
        name: 'Prime Wagyu Ribeye Steak',
        category: 'Main Course',
        price: 24500,
        image_url: 'https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=1200&q=80',
      },
      {
        hotel_id: hotelId,
        name: 'Atlantic Lobster & Jumbo Prawns',
        category: 'Seafood',
        price: 28000,
        image_url: 'https://images.unsplash.com/photo-1533777857889-4be7c70b33f7?auto=format&fit=crop&w=1200&q=80',
      },
      {
        hotel_id: hotelId,
        name: 'Golden Truffle Artisan Burger',
        category: 'Gourmet',
        price: 14500,
        image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80',
      },
      {
        hotel_id: hotelId,
        name: 'Luxora Royal Signature Cocktail',
        category: 'Beverages',
        price: 8500,
        image_url: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=1200&q=80',
      },
    ];

    const { data: existingMenu } = await supabase.from('menu_items').select('name');
    const existingMenuNames = (existingMenu || []).map((m) => m.name);
    const toInsertMenu = menuData.filter((m) => !existingMenuNames.includes(m.name));
    if (toInsertMenu.length > 0) {
      await supabase.from('menu_items').insert(toInsertMenu);
      console.log(`✅ [Seeder]: Inserted ${toInsertMenu.length} menu items`);
    }

    // 7. Seed Gallery Images
    const galleryData = [
      { hotel_id: hotelId, caption: 'Grand Reception Lobby', category: 'Lobby', image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80' },
      { hotel_id: hotelId, caption: 'Presidential Penthouse Bedroom', category: 'Rooms', image_url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80' },
      { hotel_id: hotelId, caption: 'Rooftop Infinity Horizon Pool', category: 'Facilities', image_url: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=1200&q=80' },
      { hotel_id: hotelId, caption: 'The Golden Leaf Restaurant', category: 'Dining', image_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80' },
      { hotel_id: hotelId, caption: 'Serena Wellness Spa Lounge', category: 'Wellness', image_url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80' },
      { hotel_id: hotelId, caption: 'Ocean Villa Sun Terrace', category: 'Views', image_url: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1200&q=80' },
    ];

    const { data: existingGallery } = await supabase.from('gallery_images').select('caption');
    const existingGalleryCaptions = (existingGallery || []).map((g) => g.caption);
    const toInsertGallery = galleryData.filter((g) => !existingGalleryCaptions.includes(g.caption));
    if (toInsertGallery.length > 0) {
      await supabase.from('gallery_images').insert(toInsertGallery);
      console.log(`✅ [Seeder]: Inserted ${toInsertGallery.length} gallery images`);
    }

    console.log('🎉 [Seeder]: Database seeding finished successfully!');
  } catch (err) {
    console.error('❌ [Seeder Error]:', err.message || err);
  }
}
