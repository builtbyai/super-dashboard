/**
 * Super Dashboard API - Cloudflare Worker
 * Full implementation with D1 Database, R2 Storage, and WebRTC Signaling
 */

// WebRTC Signaling Room (Durable Object)
export class WebRTCRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.roomInfo = null;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      await this.handleSession(server, url.searchParams.get('userId'));

      return new Response(null, { status: 101, webSocket: client });
    }

    // REST API for room info
    if (url.pathname.endsWith('/info')) {
      return new Response(JSON.stringify({
        participants: this.sessions.size,
        roomInfo: this.roomInfo
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('WebRTC Room', { status: 200 });
  }

  async handleSession(webSocket, userId) {
    webSocket.accept();

    const session = {
      id: userId || crypto.randomUUID(),
      webSocket,
      joinedAt: Date.now()
    };

    this.sessions.set(session.id, session);

    // Notify others of new participant
    this.broadcast({
      type: 'user-joined',
      userId: session.id,
      participants: Array.from(this.sessions.keys())
    }, session.id);

    webSocket.addEventListener('message', async (msg) => {
      try {
        const data = JSON.parse(msg.data);

        switch (data.type) {
          case 'offer':
          case 'answer':
          case 'ice-candidate':
            // Forward to specific peer
            if (data.targetId && this.sessions.has(data.targetId)) {
              this.sessions.get(data.targetId).webSocket.send(JSON.stringify({
                ...data,
                senderId: session.id
              }));
            }
            break;

          case 'chat':
            // Broadcast chat message
            this.broadcast({
              type: 'chat',
              senderId: session.id,
              message: data.message,
              timestamp: Date.now()
            });
            break;

          case 'screen-share-start':
          case 'screen-share-stop':
            this.broadcast({
              type: data.type,
              userId: session.id
            });
            break;
        }
      } catch (e) {
        console.error('WebSocket message error:', e);
      }
    });

    webSocket.addEventListener('close', () => {
      this.sessions.delete(session.id);
      this.broadcast({
        type: 'user-left',
        userId: session.id,
        participants: Array.from(this.sessions.keys())
      });
    });

    // Send current participants to new user
    webSocket.send(JSON.stringify({
      type: 'room-state',
      yourId: session.id,
      participants: Array.from(this.sessions.keys()).filter(id => id !== session.id)
    }));
  }

  broadcast(message, excludeId = null) {
    const msg = JSON.stringify(message);
    for (const [id, session] of this.sessions) {
      if (id !== excludeId) {
        try {
          session.webSocket.send(msg);
        } catch (e) {
          this.sessions.delete(id);
        }
      }
    }
  }
}

// Main Worker
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ═══════════════════════════════════════════════════════════════
      // WEBRTC SIGNALING
      // ═══════════════════════════════════════════════════════════════
      if (path.startsWith('/api/webrtc/room/')) {
        const roomId = path.split('/')[4];
        const roomObjectId = env.WEBRTC_ROOMS.idFromName(roomId);
        const roomObject = env.WEBRTC_ROOMS.get(roomObjectId);
        return roomObject.fetch(request);
      }

      // ═══════════════════════════════════════════════════════════════
      // HEALTH & INFO
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/health') {
        return json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          version: '2.0.0',
          features: ['d1', 'r2', 'webrtc', 'realtime']
        }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // DATABASE INITIALIZATION
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/init-db' && method === 'POST') {
        await initDatabase(env.DB);
        return json({ success: true, message: 'Database initialized' }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // CUSTOMERS API
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/customers' && method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT * FROM customers ORDER BY created_at DESC'
        ).all();
        return json({ success: true, data: results || [] }, corsHeaders);
      }

      if (path === '/api/customers' && method === 'POST') {
        const body = await request.json();
        const result = await env.DB.prepare(
          `INSERT INTO customers (name, email, phone, company, address, city, state, zip, status, priority, revenue, projects, notes, tags, last_contact)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          body.name, body.email, body.phone, body.company,
          body.address, body.city, body.state, body.zip,
          body.status || 'active', body.priority || 'medium',
          body.revenue || 0, body.projects || 0,
          body.notes, body.tags, body.last_contact || new Date().toISOString().slice(0, 10)
        ).run();
        return json({ success: true, data: { id: result.meta.last_row_id, ...body } }, corsHeaders);
      }

      if (path.match(/^\/api\/customers\/\d+$/) && method === 'GET') {
        const id = path.split('/')[3];
        const customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first();
        return json({ success: true, data: customer }, corsHeaders);
      }

      if (path.match(/^\/api\/customers\/\d+$/) && method === 'PUT') {
        const id = path.split('/')[3];
        const body = await request.json();
        await env.DB.prepare(
          `UPDATE customers SET name = ?, email = ?, phone = ?, company = ?, address = ?, city = ?, state = ?, zip = ?,
           status = ?, priority = ?, revenue = ?, projects = ?, notes = ?, tags = ?, last_contact = ?, updated_at = datetime('now')
           WHERE id = ?`
        ).bind(
          body.name, body.email, body.phone, body.company,
          body.address, body.city, body.state, body.zip,
          body.status, body.priority, body.revenue, body.projects,
          body.notes, body.tags, body.last_contact, id
        ).run();
        return json({ success: true, data: { id, ...body } }, corsHeaders);
      }

      if (path.match(/^\/api\/customers\/\d+$/) && method === 'DELETE') {
        const id = path.split('/')[3];
        await env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(id).run();
        return json({ success: true, message: 'Customer deleted' }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // INVOICES API
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/invoices' && method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT * FROM invoices ORDER BY created_at DESC'
        ).all();
        return json({ success: true, data: results || [] }, corsHeaders);
      }

      if (path === '/api/invoices' && method === 'POST') {
        const body = await request.json();
        const invoiceNum = body.invoice_number || `INV-${Date.now().toString(36).toUpperCase()}`;
        const result = await env.DB.prepare(
          `INSERT INTO invoices (invoice_number, customer_id, customer_name, amount, status, due_date, items, notes, payment_link)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          invoiceNum, body.customer_id || null, body.customer_name || null,
          body.amount || 0, body.status || 'pending',
          body.due_date || null, typeof body.items === 'string' ? body.items : JSON.stringify(body.items || []),
          body.notes || null, body.payment_link || null
        ).run();
        return json({ success: true, data: { id: result.meta.last_row_id, invoice_number: invoiceNum, ...body } }, corsHeaders);
      }

      if (path.match(/^\/api\/invoices\/\d+$/) && method === 'PUT') {
        const id = path.split('/')[3];
        const body = await request.json();
        await env.DB.prepare(
          `UPDATE invoices SET customer_name = ?, amount = ?, status = ?, due_date = ?, paid_date = ?,
           items = ?, notes = ?, payment_method = ?, updated_at = datetime('now') WHERE id = ?`
        ).bind(
          body.customer_name, body.amount, body.status, body.due_date, body.paid_date,
          JSON.stringify(body.items || []), body.notes, body.payment_method, id
        ).run();
        return json({ success: true, data: { id, ...body } }, corsHeaders);
      }

      if (path.match(/^\/api\/invoices\/\d+$/) && method === 'DELETE') {
        const id = path.split('/')[3];
        await env.DB.prepare('DELETE FROM invoices WHERE id = ?').bind(id).run();
        return json({ success: true, message: 'Invoice deleted' }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // PROPOSALS API
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/proposals' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM proposals ORDER BY created_at DESC').all();
        return json({ success: true, data: results || [] }, corsHeaders);
      }

      if (path === '/api/proposals' && method === 'POST') {
        const body = await request.json();
        const result = await env.DB.prepare(
          `INSERT INTO proposals (title, customer_id, client, template, amount, status, content, valid_until)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(body.title || 'Untitled', body.customer_id || null, body.client || null, body.template || null, body.amount || 0, body.status || 'draft', body.content || null, body.valid_until || null).run();
        return json({ success: true, data: { id: result.meta.last_row_id, ...body } }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // EVENTS/CALENDAR API
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/events' && method === 'GET') {
        const startDate = url.searchParams.get('start');
        const endDate = url.searchParams.get('end');
        let query = 'SELECT * FROM events';
        const params = [];

        if (startDate && endDate) {
          query += ' WHERE event_date BETWEEN ? AND ?';
          params.push(startDate, endDate);
        }
        query += ' ORDER BY event_date, event_time';

        const stmt = env.DB.prepare(query);
        const { results } = params.length ? await stmt.bind(...params).all() : await stmt.all();
        return json({ success: true, data: results || [] }, corsHeaders);
      }

      if (path === '/api/events' && method === 'POST') {
        const body = await request.json();
        const result = await env.DB.prepare(
          `INSERT INTO events (title, description, event_date, event_time, end_time, duration, color, event_type, location, attendees, customer_ids, reminder)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          body.title || 'Untitled Event', body.description || null, body.event_date || null, body.event_time || null, body.end_time || null,
          body.duration || 60, body.color || '#3B82F6', body.event_type || 'meeting',
          body.location || null, JSON.stringify(body.attendees || []), JSON.stringify(body.customer_ids || []), body.reminder || 30
        ).run();
        return json({ success: true, data: { id: result.meta.last_row_id, ...body } }, corsHeaders);
      }

      if (path.match(/^\/api\/events\/\d+$/) && method === 'DELETE') {
        const id = path.split('/')[3];
        await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
        return json({ success: true, message: 'Event deleted' }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // TASKS API
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/tasks' && method === 'GET') {
        const status = url.searchParams.get('status');
        let query = 'SELECT * FROM tasks';
        if (status) query += ` WHERE status = '${status}'`;
        query += ' ORDER BY priority DESC, due_date ASC';
        const { results } = await env.DB.prepare(query).all();
        return json({ success: true, data: results || [] }, corsHeaders);
      }

      if (path === '/api/tasks' && method === 'POST') {
        const body = await request.json();
        const result = await env.DB.prepare(
          `INSERT INTO tasks (title, description, status, priority, due_date, assigned_to, customer_id, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(body.title || 'Untitled Task', body.description || null, body.status || 'todo', body.priority || 'medium', body.due_date || null, body.assigned_to || null, body.customer_id || null, body.tags || null).run();
        return json({ success: true, data: { id: result.meta.last_row_id, ...body } }, corsHeaders);
      }

      if (path.match(/^\/api\/tasks\/\d+$/) && method === 'PUT') {
        const id = path.split('/')[3];
        const body = await request.json();
        const completedAt = body.status === 'done' ? new Date().toISOString() : null;
        await env.DB.prepare(
          `UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, due_date = ?,
           assigned_to = ?, tags = ?, updated_at = datetime('now'), completed_at = ? WHERE id = ?`
        ).bind(body.title, body.description, body.status, body.priority, body.due_date, body.assigned_to, body.tags, completedAt, id).run();
        return json({ success: true, data: { id, ...body } }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // FILES API (R2)
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/files' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM files ORDER BY created_at DESC').all();
        return json({ success: true, data: results || [] }, corsHeaders);
      }

      if (path === '/api/files/upload' && method === 'POST') {
        const formData = await request.formData();
        const file = formData.get('file');
        const folder = formData.get('folder') || 'general';
        const customerId = formData.get('customer_id');

        if (!file) {
          return json({ success: false, error: 'No file provided' }, corsHeaders, 400);
        }

        const r2Key = `${folder}/${Date.now()}-${file.name}`;
        await env.R2.put(r2Key, file.stream(), {
          httpMetadata: { contentType: file.type }
        });

        const result = await env.DB.prepare(
          `INSERT INTO files (filename, original_name, mime_type, size, r2_key, customer_id, folder)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(file.name, file.name, file.type, file.size, r2Key, customerId, folder).run();

        return json({ success: true, data: { id: result.meta.last_row_id, r2_key: r2Key, filename: file.name } }, corsHeaders);
      }

      if (path.startsWith('/api/files/download/')) {
        const fileId = path.split('/')[4];
        const file = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(fileId).first();

        if (!file) {
          return json({ success: false, error: 'File not found' }, corsHeaders, 404);
        }

        const r2Object = await env.R2.get(file.r2_key);
        if (!r2Object) {
          return json({ success: false, error: 'File not found in storage' }, corsHeaders, 404);
        }

        return new Response(r2Object.body, {
          headers: {
            'Content-Type': file.mime_type || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${file.original_name}"`,
            ...corsHeaders
          }
        });
      }

      if (path.match(/^\/api\/files\/\d+$/) && method === 'DELETE') {
        const id = path.split('/')[3];
        const file = await env.DB.prepare('SELECT r2_key FROM files WHERE id = ?').bind(id).first();
        if (file) {
          await env.R2.delete(file.r2_key);
          await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(id).run();
        }
        return json({ success: true, message: 'File deleted' }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // MEDIA API (Streaming with Range Support)
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/media' && method === 'GET') {
        // Get all media files (video/audio)
        const { results } = await env.DB.prepare(`
          SELECT * FROM files
          WHERE mime_type LIKE 'video/%' OR mime_type LIKE 'audio/%'
          ORDER BY created_at DESC
        `).all();
        return json({ success: true, data: results || [] }, corsHeaders);
      }

      if (path === '/api/media/upload' && method === 'POST') {
        const formData = await request.formData();
        const file = formData.get('file');
        const title = formData.get('title') || file?.name;
        const thumbnail = formData.get('thumbnail');

        if (!file) {
          return json({ success: false, error: 'No file provided' }, corsHeaders, 400);
        }

        // Only allow video/audio
        if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
          return json({ success: false, error: 'Only video/audio files allowed' }, corsHeaders, 400);
        }

        const r2Key = `media/${Date.now()}-${file.name}`;
        await env.R2.put(r2Key, file.stream(), {
          httpMetadata: { contentType: file.type }
        });

        // Upload thumbnail if provided
        let thumbnailKey = null;
        if (thumbnail) {
          thumbnailKey = `thumbnails/${Date.now()}-thumb.jpg`;
          await env.R2.put(thumbnailKey, thumbnail.stream(), {
            httpMetadata: { contentType: 'image/jpeg' }
          });
        }

        const result = await env.DB.prepare(
          `INSERT INTO files (filename, original_name, mime_type, size, r2_key, folder)
           VALUES (?, ?, ?, ?, ?, 'media')`
        ).bind(title, file.name, file.type, file.size, r2Key).run();

        return json({
          success: true,
          data: {
            id: result.meta.last_row_id,
            r2_key: r2Key,
            filename: title,
            mime_type: file.type,
            size: file.size
          }
        }, corsHeaders);
      }

      // Stream media with byte-range support (for video seeking)
      if (path.startsWith('/api/media/stream/')) {
        const fileId = path.split('/')[4];
        const file = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(fileId).first();

        if (!file) {
          return json({ success: false, error: 'Media not found' }, corsHeaders, 404);
        }

        const r2Object = await env.R2.get(file.r2_key);
        if (!r2Object) {
          return json({ success: false, error: 'Media file not found in storage' }, corsHeaders, 404);
        }

        const rangeHeader = request.headers.get('Range');
        const contentLength = r2Object.size;

        // Handle Range requests for video seeking
        if (rangeHeader) {
          const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
          if (match) {
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : contentLength - 1;
            const chunkSize = end - start + 1;

            // Get ranged data from R2
            const rangedObject = await env.R2.get(file.r2_key, {
              range: { offset: start, length: chunkSize }
            });

            return new Response(rangedObject.body, {
              status: 206,
              headers: {
                'Content-Type': file.mime_type || 'video/mp4',
                'Content-Length': chunkSize.toString(),
                'Content-Range': `bytes ${start}-${end}/${contentLength}`,
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
              }
            });
          }
        }

        // Full file response
        return new Response(r2Object.body, {
          headers: {
            'Content-Type': file.mime_type || 'video/mp4',
            'Content-Length': contentLength.toString(),
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
          }
        });
      }

      // Get media info
      if (path.match(/^\/api\/media\/\d+$/) && method === 'GET') {
        const id = path.split('/')[3];
        const file = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(id).first();
        if (!file) {
          return json({ success: false, error: 'Media not found' }, corsHeaders, 404);
        }
        return json({ success: true, data: file }, corsHeaders);
      }

      // Delete media
      if (path.match(/^\/api\/media\/\d+$/) && method === 'DELETE') {
        const id = path.split('/')[3];
        const file = await env.DB.prepare('SELECT r2_key FROM files WHERE id = ?').bind(id).first();
        if (file) {
          await env.R2.delete(file.r2_key);
          await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(id).run();
        }
        return json({ success: true, message: 'Media deleted' }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // ANALYTICS API
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/analytics/summary' && method === 'GET') {
        const [customers, invoices, tasks, events] = await Promise.all([
          env.DB.prepare('SELECT COUNT(*) as total, SUM(revenue) as revenue FROM customers WHERE status = "active"').first(),
          env.DB.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN status = "pending" THEN amount ELSE 0 END) as pending, SUM(CASE WHEN status = "paid" THEN amount ELSE 0 END) as paid FROM invoices').first(),
          env.DB.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN status = "todo" THEN 1 ELSE 0 END) as todo FROM tasks').first(),
          env.DB.prepare('SELECT COUNT(*) as total FROM events WHERE event_date >= date("now")').first()
        ]);

        const totalInvoiced = (invoices?.pending || 0) + (invoices?.paid || 0);
        const collectionRate = totalInvoiced > 0 ? ((invoices?.paid || 0) / totalInvoiced * 100).toFixed(1) : 0;

        return json({
          success: true,
          data: {
            totalCustomers: customers?.total || 0,
            totalRevenue: customers?.revenue || 0,
            activeCustomers: customers?.total || 0,
            pendingInvoices: invoices?.pending || 0,
            paidInvoices: invoices?.paid || 0,
            collectionRate: parseFloat(collectionRate),
            totalTasks: tasks?.total || 0,
            pendingTasks: tasks?.todo || 0,
            upcomingEvents: events?.total || 0
          }
        }, corsHeaders);
      }

      if (path === '/api/analytics/revenue' && method === 'GET') {
        const { results } = await env.DB.prepare(`
          SELECT strftime('%Y-%m', created_at) as month, SUM(amount) as total
          FROM invoices WHERE status = 'paid'
          GROUP BY month ORDER BY month DESC LIMIT 12
        `).all();
        return json({ success: true, data: { monthly: results || [] } }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // BOOKMARKS API
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/bookmarks' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM bookmarks ORDER BY created_at DESC').all();
        return json({ success: true, data: results || [] }, corsHeaders);
      }

      if (path === '/api/bookmarks' && method === 'POST') {
        const body = await request.json();
        const result = await env.DB.prepare(
          'INSERT INTO bookmarks (title, url, folder, icon) VALUES (?, ?, ?, ?)'
        ).bind(body.title || 'Untitled', body.url || '', body.folder || 'general', body.icon || null).run();
        return json({ success: true, data: { id: result.meta.last_row_id, ...body } }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // SIGNATURES API
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/signatures' && method === 'GET') {
        const userId = url.searchParams.get('user_id') || 'default';
        const sig = await env.DB.prepare('SELECT * FROM signatures WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(userId).first();
        return json({ success: true, data: sig }, corsHeaders);
      }

      if (path === '/api/signatures' && method === 'POST') {
        const body = await request.json();
        const result = await env.DB.prepare(
          'INSERT INTO signatures (user_id, signature_data) VALUES (?, ?)'
        ).bind(body.user_id || 'default', body.signature_data).run();
        return json({ success: true, data: { id: result.meta.last_row_id } }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // SETTINGS API
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/settings' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT key, value, category FROM settings').all();
        const settings = {};
        (results || []).forEach(r => { settings[r.key] = r.value; });
        return json({ success: true, data: settings }, corsHeaders);
      }

      if (path === '/api/settings' && method === 'PUT') {
        const body = await request.json();
        for (const [key, value] of Object.entries(body)) {
          await env.DB.prepare(
            'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))'
          ).bind(key, typeof value === 'string' ? value : JSON.stringify(value)).run();
        }
        return json({ success: true, data: body }, corsHeaders);
      }

      // 404
      return json({ success: false, error: 'Not found', path }, corsHeaders, 404);

    } catch (error) {
      console.error('API Error:', error);
      return json({ success: false, error: error.message, stack: error.stack }, corsHeaders, 500);
    }
  }
};

// Helper functions
function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

async function initDatabase(db) {
  const schema = `
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      status TEXT DEFAULT 'active',
      priority TEXT DEFAULT 'medium',
      revenue REAL DEFAULT 0,
      projects INTEGER DEFAULT 0,
      notes TEXT,
      tags TEXT,
      last_contact TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      customer_name TEXT,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      due_date TEXT,
      paid_date TEXT,
      items TEXT,
      notes TEXT,
      payment_method TEXT,
      payment_link TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      customer_id INTEGER,
      client TEXT,
      template TEXT,
      amount REAL,
      status TEXT DEFAULT 'draft',
      content TEXT,
      valid_until TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      event_date TEXT NOT NULL,
      event_time TEXT,
      end_time TEXT,
      duration INTEGER DEFAULT 60,
      color TEXT DEFAULT '#3B82F6',
      event_type TEXT DEFAULT 'meeting',
      location TEXT,
      attendees TEXT,
      customer_ids TEXT,
      reminder INTEGER DEFAULT 30,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'todo',
      priority TEXT DEFAULT 'medium',
      due_date TEXT,
      assigned_to TEXT,
      customer_id INTEGER,
      tags TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT,
      size INTEGER,
      r2_key TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      folder TEXT DEFAULT 'general',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      folder TEXT DEFAULT 'general',
      icon TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS signatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      signature_data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      category TEXT DEFAULT 'general',
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `;

  const statements = schema.split(';').filter(s => s.trim());
  for (const stmt of statements) {
    if (stmt.trim()) {
      await db.prepare(stmt).run();
    }
  }
}
