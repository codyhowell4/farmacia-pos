// ============================================================
// js/api.js - Farmacia API Abstraction Layer
// ============================================================
// Connects farmacia-app to the farmacia-pos Supabase backend.
// Every method tries Supabase first, then falls back to the
// existing localStorage data layer so the app never breaks.
//
// Available on window.FarmaciaAPI:
//   getCurrentUser, signIn, signOut,
//   getCustomerProfile, getProducts,
//   getCustomerOrders, getAppointments, getPrescriptions
// ============================================================

window.FarmaciaAPI = (function () {
  'use strict';

  const sb = window.farmaciaSupabase;
  const isSupabaseAvailable = !!sb;

  // Helper: check if a string is a valid UUID
  function isValidUuid(str) {
    return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
  }

  if (!isSupabaseAvailable) {
    console.log('[FarmaciaAPI] Fallback mode active - Supabase not available');
  }

  // ------------------------------------------------------------------
  // localStorage helpers (fallback)
  // ------------------------------------------------------------------
  function lsGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  // ------------------------------------------------------------------
  // Auth helpers
  // ------------------------------------------------------------------
  async function getAuthUser() {
    if (!sb) return null;
    try {
      const { data, error } = await sb.auth.getUser();
      if (error) throw error;
      return data.user || null;
    } catch (err) {
      return null;
    }
  }

  async function getCustomerId() {
    const user = await getAuthUser();
    if (!user) return null;
    try {
      const { data, error } = await sb
        .from('customers')
        .select('id')
        .eq('profile_id', user.id)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null; // no rows
        throw error;
      }
      return data ? data.id : null;
    } catch (err) {
      console.warn('[FarmaciaAPI] getCustomerId failed:', err.message);
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Status mappers
  // ------------------------------------------------------------------
  function mapOrderStatus(status) {
    const map = {
      processing: 'Procesando',
      shipped:    'Enviado',
      delivered:  'Entregado',
      cancelled:  'Cancelado'
    };
    return map[status] || status || 'Procesando';
  }

  function mapPaymentMethod(pm) {
    if (pm === 'card')      return 'Tarjeta';
    if (pm === 'insurance') return 'Seguro';
    return 'Efectivo';
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  return {
    /**
     * Returns true when the Supabase client is connected.
     */
    isSupabaseAvailable() {
      return isSupabaseAvailable;
    },

    /**
     * Get the currently signed-in Supabase Auth user.
     */
    async getCurrentUser() {
      const user = await getAuthUser();
      if (user) {
        console.log('[FarmaciaAPI] Current user:', user.email);
      }
      return user;
    },

    /**
     * Sign in with email and password.
     */
    async signIn(email, password) {
      if (!sb) {
        console.warn('[FarmaciaAPI] signIn fallback - Supabase not available');
        return { data: null, error: new Error('Supabase not available') };
      }
      try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        console.log('[FarmaciaAPI] User signed in:', data.user?.email);
        return { data, error: null };
      } catch (err) {
        console.error('[FarmaciaAPI] signIn failed:', err.message);
        return { data: null, error: err };
      }
    },

    /**
     * Sign out the current user.
     */
    async signOut() {
      if (!sb) {
        console.warn('[FarmaciaAPI] signOut fallback - Supabase not available');
        return { error: null };
      }
      try {
        const { error } = await sb.auth.signOut();
        if (error) throw error;
        console.log('[FarmaciaAPI] User signed out');
        return { error: null };
      } catch (err) {
        console.error('[FarmaciaAPI] signOut failed:', err.message);
        return { error: err };
      }
    },

    /**
     * Get the customer profile linked to the current auth user.
     * Falls back to localStorage userProfile.
     */
    async getCustomerProfile() {
      const fallback = () =>
        lsGet('userProfile', { name: 'María García', height: null, birthdate: '', gender: '' });

      if (!sb) {
        console.log('[FarmaciaAPI] getCustomerProfile fallback');
        return fallback();
      }

      try {
        const user = await getAuthUser();
        if (!user) {
          console.log('[FarmaciaAPI] No auth user, profile fallback');
          return fallback();
        }

        const { data, error } = await sb
          .from('customers')
          .select('id, full_name, phone, email, address, date_of_birth, profile_id')
          .eq('profile_id', user.id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            console.log('[FarmaciaAPI] No customer record yet, profile fallback');
            return fallback();
          }
          throw error;
        }

        console.log('[FarmaciaAPI] Customer profile loaded from Supabase');
        return {
          id:         data.id,
          name:       data.full_name,
          phone:      data.phone,
          email:      data.email,
          address:    data.address,
          birthdate:  data.date_of_birth,
          profileId:  data.profile_id,
          source:     'supabase'
        };
      } catch (err) {
        console.warn('[FarmaciaAPI] getCustomerProfile error:', err.message);
        return fallback();
      }
    },

    /**
     * Get the product catalog (inventory).
     * Falls back to localStorage apollo_medicines.
     */
    async getProducts() {
      const fallback = () => lsGet('apollo_medicines', []);

      if (!sb) {
        console.log('[FarmaciaAPI] getProducts fallback');
        return fallback();
      }

      try {
        const { data, error } = await sb
          .from('inventory')
          .select('id, name, "use", price, quantity, requires_prescription, category, image_url, barcode, low_stock_threshold')
          .gt('quantity', 0)
          .order('name');

        if (error) throw error;

        if (data && data.length > 0) {
          console.log('[FarmaciaAPI] Products loaded from Supabase:', data.length);
          return data.map(item => ({
            id:                   item.id,
            name:                 item.name,
            brand:                item.barcode || 'Genérico',
            price:                parseFloat(item.price) || 0,
            category:             item.category || 'otc',
            description:          item.use || '',
            stock:                item.quantity || 0,
            requiresPrescription: item.requires_prescription || false,
            imageUrl:             item.image_url || null,
            lowStockThreshold:    item.low_stock_threshold || 10,
            source:               'supabase'
          }));
        }

        console.log('[FarmaciaAPI] No products from Supabase, fallback');
        return fallback();
      } catch (err) {
        console.warn('[FarmaciaAPI] getProducts error:', err.message);
        return fallback();
      }
    },

    /**
     * Get orders for the current customer.
     * Falls back to localStorage apollo_orders.
     */
    async getCustomerOrders() {
      const fallback = () => lsGet('apollo_orders', []);

      if (!sb) {
        console.log('[FarmaciaAPI] getCustomerOrders fallback');
        return fallback();
      }

      try {
        const customerId = await getCustomerId();
        if (!customerId) {
          console.log('[FarmaciaAPI] No customer link, orders fallback');
          return fallback();
        }

        const { data, error } = await sb
          .from('sales')
          .select('*, sale_items(*)')
          .eq('customer_id', customerId)
          .eq('voided', false)
          .order('timestamp', { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
          console.log('[FarmaciaAPI] Orders loaded from Supabase:', data.length);
          return data.map(order => ({
            id:       order.id,
            date:     order.timestamp ? order.timestamp.split('T')[0] : '',
            status:   mapOrderStatus(order.status),
            total:    parseFloat(order.total) || 0,
            items:    (order.sale_items || []).map(item => ({
              name:     item.name,
              quantity: item.quantity,
              price:    parseFloat(item.price) || 0
            })),
            payment:  mapPaymentMethod(order.payment_method),
            delivery: 'Recogida en tienda',
            source:   'supabase'
          }));
        }

        console.log('[FarmaciaAPI] No orders from Supabase, fallback');
        return fallback();
      } catch (err) {
        console.warn('[FarmaciaAPI] getCustomerOrders error:', err.message);
        return fallback();
      }
    },

    /**
     * Get appointments for the current user.
     * Falls back to localStorage appointments + videoConsultations.
     */
    async getAppointments() {
      const fallback = () => {
        const local = lsGet('appointments', []);
        const video = lsGet('videoConsultations', []);
        return [...local, ...video];
      };

      if (!sb) {
        console.log('[FarmaciaAPI] getAppointments fallback');
        return fallback();
      }

      try {
        const user = await getAuthUser();
        if (!user) {
          console.log('[FarmaciaAPI] No auth user, appointments fallback');
          return fallback();
        }

        const { data, error } = await sb
          .from('appointments')
          .select('*')
          .eq('customer_id', user.id)
          .order('appointment_date', { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
          console.log('[FarmaciaAPI] Appointments loaded from Supabase:', data.length);
          return data.map(appt => ({
            id:         appt.id,
            date:       appt.appointment_date ? appt.appointment_date.split('T')[0] : '',
            time:       appt.appointment_date ? appt.appointment_date.split('T')[1]?.slice(0, 5) : '',
            status:     appt.status,
            type:       appt.type || 'in_person',
            meetingUrl: appt.meeting_url || null,
            meetingId:  appt.meeting_id || null,
            notes:      appt.notes || '',
            doctorId:   appt.doctor_id,
            source:     'supabase'
          }));
        }

        console.log('[FarmaciaAPI] No appointments from Supabase, fallback');
        return fallback();
      } catch (err) {
        console.warn('[FarmaciaAPI] getAppointments error:', err.message);
        return fallback();
      }
    },

    /**
     * Get prescriptions for the current user.
     * Combines customer_documents (type='receta') + medical_notes.
     * Falls back to localStorage allPrescriptions.
     */
    async getPrescriptions() {
      const fallback = () => lsGet('allPrescriptions', []);

      if (!sb) {
        console.log('[FarmaciaAPI] getPrescriptions fallback');
        return fallback();
      }

      try {
        const user = await getAuthUser();
        if (!user) {
          console.log('[FarmaciaAPI] No auth user, prescriptions fallback');
          return fallback();
        }

        const [docsRes, notesRes] = await Promise.all([
          sb.from('customer_documents')
            .select('*')
            .eq('customer_id', user.id)
            .eq('document_type', 'receta'),
          sb.from('medical_notes')
            .select('*')
            .eq('customer_id', user.id)
        ]);

        const prescriptions = [];

        if (!docsRes.error && docsRes.data) {
          docsRes.data.forEach(doc => {
            prescriptions.push({
              id:        doc.id,
              type:      'document',
              fileUrl:   doc.file_url,
              notes:     doc.notes,
              createdAt: doc.created_at,
              source:    'supabase'
            });
          });
        }

        if (!notesRes.error && notesRes.data) {
          notesRes.data.forEach(note => {
            prescriptions.push({
              id:        note.id,
              type:      'note',
              doctorId:  note.doctor_id,
              content:   note.note,
              createdAt: note.created_at,
              source:    'supabase'
            });
          });
        }

        if (prescriptions.length > 0) {
          console.log('[FarmaciaAPI] Prescriptions loaded from Supabase:', prescriptions.length);
          return prescriptions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }

        console.log('[FarmaciaAPI] No prescriptions from Supabase, fallback');
        return fallback();
      } catch (err) {
        console.warn('[FarmaciaAPI] getPrescriptions error:', err.message);
        return fallback();
      }
    },

    /**
     * Sign up a new user with email and password.
     */
    async signUp(email, password, fullName) {
      if (!sb) {
        console.warn('[FarmaciaAPI] signUp fallback - Supabase not available');
        return { data: null, error: new Error('Supabase not available') };
      }
      try {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName }
          }
        });
        if (error) throw error;
        console.log('[FarmaciaAPI] User signed up:', data.user?.email);
        return { data, error: null };
      } catch (err) {
        console.error('[FarmaciaAPI] signUp failed:', err.message);
        return { data: null, error: err };
      }
    },

    /**
     * Ensure the current auth user has a customers row.
     * Creates one if missing. Requires SUPABASE_CONFIG.DEFAULT_ORG_ID.
     */
    async ensureCustomerProfile(fullName) {
      if (!sb) {
        console.log('[FarmaciaAPI] ensureCustomerProfile skipped - Supabase not available');
        return null;
      }
      try {
        const user = await getAuthUser();
        if (!user) {
          console.log('[FarmaciaAPI] ensureCustomerProfile skipped - no auth user');
          return null;
        }

        // Check if customer record already exists
        const { data: existing, error: checkErr } = await sb
          .from('customers')
          .select('id')
          .eq('profile_id', user.id)
          .single();

        if (checkErr && checkErr.code !== 'PGRST116') {
          throw checkErr;
        }

        if (existing) {
          console.log('[FarmaciaAPI] Customer profile already exists');
          return existing.id;
        }

        // Need org_id to create customer
        const defaultOrgId = (window.farmaciaSupabaseConfig || {}).DEFAULT_ORG_ID;
        if (!defaultOrgId) {
          console.warn('[FarmaciaAPI] Cannot create customer: SUPABASE_CONFIG.DEFAULT_ORG_ID not set');
          return null;
        }

        const { data: newCustomer, error: createErr } = await sb
          .from('customers')
          .insert({
            org_id: defaultOrgId,
            profile_id: user.id,
            full_name: fullName || user.user_metadata?.full_name || user.email,
            email: user.email,
            phone: null,
            address: null,
            date_of_birth: null,
            notes: null
          })
          .select('id')
          .single();

        if (createErr) throw createErr;
        console.log('[FarmaciaAPI] Customer profile created:', newCustomer.id);
        return newCustomer.id;
      } catch (err) {
        console.error('[FarmaciaAPI] ensureCustomerProfile failed:', err.message);
        return null;
      }
    },

    /**
     * Place an order in Supabase.
     * Creates a sale header + sale_items, then deducts inventory.
     * Requires authenticated user with a customers row.
     */
    /**
     * Create an appointment in Supabase.
     */
    async createAppointment(appointmentData) {
      if (!sb) {
        return { data: null, error: new Error('Supabase not available') };
      }
      const user = await getAuthUser();
      if (!user) {
        return { data: null, error: new Error('Not authenticated') };
      }
      try {
        const { data: customer, error: custErr } = await sb
          .from('customers')
          .select('id, org_id')
          .eq('profile_id', user.id)
          .single();
        if (custErr) throw custErr;
        if (!customer) throw new Error('Customer record not found');

        const orgId = customer.org_id || (window.farmaciaSupabaseConfig || {}).DEFAULT_ORG_ID;
        if (!orgId) throw new Error('org_id not available');

        const appointment = {
          org_id: orgId,
          customer_id: customer.id,
          doctor_id: appointmentData.doctorId || null,
          appointment_date: appointmentData.appointmentDate || new Date().toISOString(),
          status: 'pending',
          type: appointmentData.type || 'in_person',
          meeting_url: appointmentData.meetingUrl || null,
          meeting_id: appointmentData.meetingId || null,
          notes: appointmentData.notes || appointmentData.reason || null
        };

        const { data, error } = await sb
          .from('appointments')
          .insert(appointment)
          .select()
          .single();

        if (error) throw error;
        console.log('[createAppointment] Supabase appointment created:', data.id);
        return { data, error: null };
      } catch (err) {
        console.error('[FarmaciaAPI] createAppointment failed:', err.message);
        return { data: null, error: err };
      }
    },

    /**
     * Upload a prescription document to Supabase Storage and create a customer_documents row.
     */
    async uploadPrescription(fileOrData) {
      if (!sb) {
        return { data: null, error: new Error('Supabase not available') };
      }
      const user = await getAuthUser();
      if (!user) {
        return { data: null, error: new Error('Not authenticated') };
      }
      try {
        const { data: customer, error: custErr } = await sb
          .from('customers')
          .select('id, org_id')
          .eq('profile_id', user.id)
          .single();
        if (custErr) throw custErr;
        if (!customer) throw new Error('Customer record not found');

        const orgId = customer.org_id || (window.farmaciaSupabaseConfig || {}).DEFAULT_ORG_ID;
        if (!orgId) throw new Error('org_id not available');

        let fileUrl = null;
        // If a File object is provided, upload to Storage
        if (fileOrData && fileOrData instanceof File) {
          const filePath = `recetas/${orgId}/${customer.id}/${Date.now()}_${fileOrData.name}`;
          const { error: uploadErr } = await sb.storage
            .from('customer-documents')
            .upload(filePath, fileOrData);
          if (uploadErr) {
            console.warn('[uploadPrescription] Storage upload failed:', uploadErr.message);
          } else {
            const { data: urlData } = sb.storage
              .from('customer-documents')
              .getPublicUrl(filePath);
            fileUrl = urlData?.publicUrl || null;
          }
        }

        const doc = {
          org_id: orgId,
          customer_id: customer.id,
          document_type: 'receta',
          file_url: fileUrl || 'pending',
          notes: fileOrData?.notes || fileOrData?.medicine || null
        };

        const { data, error } = await sb
          .from('customer_documents')
          .insert(doc)
          .select()
          .single();

        if (error) throw error;
        console.log('[uploadPrescription] Supabase document uploaded:', data.id);
        return { data, error: null };
      } catch (err) {
        console.error('[FarmaciaAPI] uploadPrescription failed:', err.message);
        return { data: null, error: err };
      }
    },

    /**
     * Create a refill/preorder request in Supabase preorders table.
     */
    async requestRefill(refillData) {
      if (!sb) {
        return { data: null, error: new Error('Supabase not available') };
      }
      const user = await getAuthUser();
      if (!user) {
        return { data: null, error: new Error('Not authenticated') };
      }
      try {
        const { data: customer, error: custErr } = await sb
          .from('customers')
          .select('id, org_id')
          .eq('profile_id', user.id)
          .single();
        if (custErr) throw custErr;
        if (!customer) throw new Error('Customer record not found');

        const orgId = customer.org_id || (window.farmaciaSupabaseConfig || {}).DEFAULT_ORG_ID;
        if (!orgId) throw new Error('org_id not available');

        const preorder = {
          org_id: orgId,
          customer_id: customer.id,
          inventory_id: isValidUuid(refillData.inventoryId) ? refillData.inventoryId : null,
          quantity: refillData.quantity || 1,
          status: 'pending',
          notes: refillData.notes || refillData.medicine || null
        };

        const { data, error } = await sb
          .from('preorders')
          .insert(preorder)
          .select()
          .single();

        if (error) throw error;
        console.log('[requestRefill] Supabase preorder created:', data.id);
        return { data, error: null };
      } catch (err) {
        console.error('[FarmaciaAPI] requestRefill failed:', err.message);
        return { data: null, error: err };
      }
    },

    async placeOrder(cartItems, checkoutData) {
      if (!sb) {
        console.log('[FarmaciaAPI] placeOrder fallback - Supabase not available');
        return { order: null, error: new Error('Supabase not available') };
      }

      const user = await getAuthUser();
      if (!user) {
        console.log('[FarmaciaAPI] placeOrder fallback - not authenticated');
        return { order: null, error: new Error('Not authenticated') };
      }

      try {
        // 1. Get customer record
        const { data: customer, error: custErr } = await sb
          .from('customers')
          .select('id, org_id, full_name, curp')
          .eq('profile_id', user.id)
          .single();

        if (custErr) throw custErr;
        if (!customer) throw new Error('Customer record not found');

        const orgId = customer.org_id || (window.farmaciaSupabaseConfig || {}).DEFAULT_ORG_ID;
        if (!orgId) throw new Error('org_id not available');

        // 2. Build sale header
        const sale = {
          org_id: orgId,
          customer_id: customer.id,
          patient_name: checkoutData.patientName || customer.full_name || 'Paciente',
          patient_curp: checkoutData.patientCurp || customer.curp || null,
          payment_method: checkoutData.paymentMethod || 'cash',
          subtotal: checkoutData.total || 0,
          total: checkoutData.total || 0,
          status: 'processing',
          voided: false,
          timestamp: new Date().toISOString()
        };

        // 3. Insert sale header
        const { data: saleRow, error: saleErr } = await sb
          .from('sales')
          .insert(sale)
          .select()
          .single();

        if (saleErr) throw saleErr;

        // 4. Build sale_items
        const saleItems = cartItems.map(item => ({
          sale_id: saleRow.id,
          inventory_id: isValidUuid(item.medicineId || item.id) ? (item.medicineId || item.id) : null,
          name: item.name,
          quantity: item.quantity,
          price: item.price
        }));

        const { error: itemsErr } = await sb
          .from('sale_items')
          .insert(saleItems);

        if (itemsErr) {
          // Try to void the orphaned sale header
          console.warn('[placeOrder] sale_items insert failed, voiding sale header:', itemsErr.message);
          await sb.from('sales').update({ voided: true, voided_by: 'system', voided_at: new Date().toISOString() }).eq('id', saleRow.id);
          throw itemsErr;
        }

        // 5. Deduct inventory for items with valid inventory_id
        let inventorySuccess = 0;
        let inventoryFail = 0;
        for (const item of cartItems) {
          const invId = item.medicineId || item.id;
          if (!isValidUuid(invId)) continue;

          try {
            const { error: rpcErr } = await sb.rpc('decrement_inventory', {
              p_id: invId,
              p_qty: item.quantity
            });

            if (rpcErr) {
              // Fallback: manual update
              const { data: currentInv } = await sb
                .from('inventory')
                .select('quantity, sales_count')
                .eq('id', invId)
                .single();

              if (currentInv) {
                const { error: updErr } = await sb.from('inventory').update({
                  quantity: currentInv.quantity - item.quantity,
                  sales_count: currentInv.sales_count + item.quantity,
                  updated_at: new Date().toISOString()
                }).eq('id', invId);

                if (updErr) {
                  console.warn('[placeOrder] Inventory fallback failed for', item.name, updErr.message);
                  inventoryFail++;
                } else {
                  console.log('[placeOrder] Inventory deducted (fallback) for', item.name);
                  inventorySuccess++;
                }
              } else {
                console.warn('[placeOrder] Inventory not found for', item.name);
                inventoryFail++;
              }
            } else {
              console.log('[placeOrder] Inventory deducted (RPC) for', item.name);
              inventorySuccess++;
            }
          } catch (invErr) {
            console.warn('[placeOrder] Inventory deduction error for', item.name, invErr.message);
            inventoryFail++;
          }
        }

        if (inventoryFail > 0) {
          console.warn(`[placeOrder] Inventory: ${inventorySuccess} succeeded, ${inventoryFail} failed`);
        } else {
          console.log('[placeOrder] All inventory deductions succeeded');
        }

        console.log('[placeOrder] Supabase order created:', saleRow.id);
        return {
          order: {
            id: saleRow.id,
            date: saleRow.timestamp ? saleRow.timestamp.split('T')[0] : new Date().toISOString().split('T')[0],
            status: 'Procesando',
            total: parseFloat(saleRow.total) || 0,
            items: cartItems,
            payment: checkoutData.paymentMethod === 'card' ? 'Tarjeta' : 'Efectivo',
            delivery: 'Recogida en tienda',
            source: 'supabase'
          },
          error: null
        };
      } catch (err) {
        console.error('[FarmaciaAPI] placeOrder failed:', err.message);
        return { order: null, error: err };
      }
    },

    /**
     * Get notifications for the current user.
     */
    async getNotifications() {
      const fallback = () => lsGet('notifications', []);
      if (!sb) return fallback();
      try {
        const user = await getAuthUser();
        if (!user) return fallback();
        const { data: customer } = await sb.from('customers').select('id').eq('profile_id', user.id).maybeSingle();
        let query = sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
        if (customer?.id) {
          query = query.or(`customer_id.eq.${customer.id},profile_id.eq.${user.id}`);
        } else {
          query = query.eq('profile_id', user.id);
        }
        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map(n => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          isRead: n.is_read,
          createdAt: n.created_at,
          source: 'supabase'
        }));
      } catch (err) {
        return fallback();
      }
    },

    async getUnreadNotificationCount() {
      if (!sb) return 0;
      try {
        const user = await getAuthUser();
        if (!user) return 0;
        const { data: customer } = await sb.from('customers').select('id').eq('profile_id', user.id).maybeSingle();
        let query = sb.from('notifications').select('*', { count: 'exact', head: true }).eq('is_read', false);
        if (customer?.id) {
          query = query.or(`customer_id.eq.${customer.id},profile_id.eq.${user.id}`);
        } else {
          query = query.eq('profile_id', user.id);
        }
        const { count, error } = await query;
        if (error) throw error;
        return count || 0;
      } catch (err) {
        return 0;
      }
    },

    async markNotificationRead(id) {
      if (!sb) return { error: new Error('Supabase not available') };
      try {
        const { data, error } = await sb.from('notifications').update({ is_read: true }).eq('id', id).select().single();
        if (error) throw error;
        return { data, error: null };
      } catch (err) {
        return { data: null, error: err };
      }
    },

    async markAllNotificationsRead() {
      if (!sb) return { error: new Error('Supabase not available') };
      try {
        const user = await getAuthUser();
        if (!user) return { error: new Error('No user') };
        const { data: customer } = await sb.from('customers').select('id').eq('profile_id', user.id).maybeSingle();
        let query = sb.from('notifications').update({ is_read: true }).eq('is_read', false);
        if (customer?.id) {
          query = query.or(`customer_id.eq.${customer.id},profile_id.eq.${user.id}`);
        } else {
          query = query.eq('profile_id', user.id);
        }
        const { error } = await query;
        if (error) throw error;
        return { error: null };
      } catch (err) {
        return { error: err };
      }
    }
  };
})();
