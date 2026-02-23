/**
 * Super Dashboard API - Cloudflare Worker
 * Handles CRM, Invoicing, Email, and Analytics endpoints
 */

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

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // API Routes
      if (path === '/api/health') {
        return json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // CUSTOMERS API
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/customers' && method === 'GET') {
        const customers = await getCustomers(env);
        return json({ success: true, data: customers }, corsHeaders);
      }

      if (path === '/api/customers' && method === 'POST') {
        const body = await request.json();
        const customer = await createCustomer(env, body);
        return json({ success: true, data: customer }, corsHeaders);
      }

      if (path.startsWith('/api/customers/') && method === 'PUT') {
        const id = path.split('/')[3];
        const body = await request.json();
        const customer = await updateCustomer(env, id, body);
        return json({ success: true, data: customer }, corsHeaders);
      }

      if (path.startsWith('/api/customers/') && method === 'DELETE') {
        const id = path.split('/')[3];
        await deleteCustomer(env, id);
        return json({ success: true, message: 'Customer deleted' }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // INVOICES API
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/invoices' && method === 'GET') {
        const invoices = await getInvoices(env);
        return json({ success: true, data: invoices }, corsHeaders);
      }

      if (path === '/api/invoices' && method === 'POST') {
        const body = await request.json();
        const invoice = await createInvoice(env, body);
        return json({ success: true, data: invoice }, corsHeaders);
      }

      if (path.startsWith('/api/invoices/') && method === 'GET') {
        const id = path.split('/')[3];
        const invoice = await getInvoice(env, id);
        return json({ success: true, data: invoice }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // ANALYTICS API
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/analytics/summary' && method === 'GET') {
        const summary = await getAnalyticsSummary(env);
        return json({ success: true, data: summary }, corsHeaders);
      }

      if (path === '/api/analytics/revenue' && method === 'GET') {
        const revenue = await getRevenueData(env);
        return json({ success: true, data: revenue }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // EMAILS API
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/emails' && method === 'GET') {
        const emails = await getEmails(env);
        return json({ success: true, data: emails }, corsHeaders);
      }

      if (path === '/api/emails/send' && method === 'POST') {
        const body = await request.json();
        const result = await sendEmail(env, body);
        return json({ success: true, data: result }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // PROPOSALS API
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/proposals' && method === 'GET') {
        const proposals = await getProposals(env);
        return json({ success: true, data: proposals }, corsHeaders);
      }

      if (path === '/api/proposals' && method === 'POST') {
        const body = await request.json();
        const proposal = await createProposal(env, body);
        return json({ success: true, data: proposal }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════════
      // SETTINGS API
      // ═══════════════════════════════════════════════════════════════
      if (path === '/api/settings' && method === 'GET') {
        const settings = await getSettings(env);
        return json({ success: true, data: settings }, corsHeaders);
      }

      if (path === '/api/settings' && method === 'PUT') {
        const body = await request.json();
        const settings = await updateSettings(env, body);
        return json({ success: true, data: settings }, corsHeaders);
      }

      // 404 Not Found
      return json({ success: false, error: 'Not found', path }, corsHeaders, 404);

    } catch (error) {
      console.error('API Error:', error);
      return json({ success: false, error: error.message }, corsHeaders, 500);
    }
  }
};

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}

// ═══════════════════════════════════════════════════════════════
// DATABASE FUNCTIONS (using D1 or KV)
// ═══════════════════════════════════════════════════════════════

// Customers
async function getCustomers(env) {
  if (env.DB) {
    const { results } = await env.DB.prepare('SELECT * FROM customers ORDER BY created_at DESC').all();
    return results || [];
  }
  // Fallback to KV
  const data = await env.KV?.get('customers', 'json');
  return data || getSampleCustomers();
}

async function createCustomer(env, data) {
  const customer = {
    id: Date.now(),
    ...data,
    created_at: new Date().toISOString()
  };

  if (env.DB) {
    await env.DB.prepare(
      'INSERT INTO customers (id, name, email, phone, company, status, priority, revenue, projects) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(customer.id, data.name, data.email, data.phone, data.company, data.status || 'active', data.priority || 'medium', data.revenue || 0, data.projects || 0).run();
    return customer;
  }

  const customers = await getCustomers(env);
  customers.push(customer);
  await env.KV?.put('customers', JSON.stringify(customers));
  return customer;
}

async function updateCustomer(env, id, data) {
  if (env.DB) {
    await env.DB.prepare(
      'UPDATE customers SET name = ?, email = ?, phone = ?, company = ?, status = ?, priority = ?, revenue = ?, projects = ? WHERE id = ?'
    ).bind(data.name, data.email, data.phone, data.company, data.status, data.priority, data.revenue, data.projects, id).run();
    return { id, ...data };
  }

  const customers = await getCustomers(env);
  const index = customers.findIndex(c => c.id == id);
  if (index >= 0) {
    customers[index] = { ...customers[index], ...data };
    await env.KV?.put('customers', JSON.stringify(customers));
    return customers[index];
  }
  throw new Error('Customer not found');
}

async function deleteCustomer(env, id) {
  if (env.DB) {
    await env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(id).run();
    return;
  }

  const customers = await getCustomers(env);
  const filtered = customers.filter(c => c.id != id);
  await env.KV?.put('customers', JSON.stringify(filtered));
}

// Invoices
async function getInvoices(env) {
  if (env.DB) {
    const { results } = await env.DB.prepare('SELECT * FROM invoices ORDER BY created_at DESC').all();
    return results || [];
  }
  const data = await env.KV?.get('invoices', 'json');
  return data || [];
}

async function createInvoice(env, data) {
  const invoice = {
    id: Date.now(),
    invoice_number: 'INV-' + Date.now().toString(36).toUpperCase(),
    ...data,
    created_at: new Date().toISOString(),
    status: data.status || 'pending'
  };

  if (env.DB) {
    await env.DB.prepare(
      'INSERT INTO invoices (id, invoice_number, customer_id, amount, status, items, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(invoice.id, invoice.invoice_number, data.customer_id, data.amount, invoice.status, JSON.stringify(data.items || []), invoice.created_at).run();
    return invoice;
  }

  const invoices = await getInvoices(env);
  invoices.push(invoice);
  await env.KV?.put('invoices', JSON.stringify(invoices));
  return invoice;
}

async function getInvoice(env, id) {
  if (env.DB) {
    const result = await env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first();
    return result;
  }
  const invoices = await getInvoices(env);
  return invoices.find(i => i.id == id);
}

// Analytics
async function getAnalyticsSummary(env) {
  const customers = await getCustomers(env);
  const invoices = await getInvoices(env);

  const totalRevenue = customers.reduce((sum, c) => sum + (c.revenue || 0), 0);
  const pendingInvoices = invoices.filter(i => i.status === 'pending');
  const paidInvoices = invoices.filter(i => i.status === 'paid');

  return {
    totalCustomers: customers.length,
    activeCustomers: customers.filter(c => c.status === 'active').length,
    totalRevenue,
    pendingInvoices: pendingInvoices.length,
    pendingAmount: pendingInvoices.reduce((sum, i) => sum + (i.amount || 0), 0),
    paidInvoices: paidInvoices.length,
    collectionRate: invoices.length > 0 ? Math.round((paidInvoices.length / invoices.length) * 100) : 0
  };
}

async function getRevenueData(env) {
  const invoices = await getInvoices(env);
  // Group by month
  const monthly = {};
  invoices.forEach(inv => {
    const month = inv.created_at?.slice(0, 7) || 'Unknown';
    monthly[month] = (monthly[month] || 0) + (inv.amount || 0);
  });
  return { monthly };
}

// Emails (mock)
async function getEmails(env) {
  const data = await env.KV?.get('emails', 'json');
  return data || getSampleEmails();
}

async function sendEmail(env, data) {
  // In production, integrate with SendGrid, Mailgun, etc.
  const email = {
    id: Date.now(),
    ...data,
    sent_at: new Date().toISOString(),
    status: 'sent'
  };

  const sent = await env.KV?.get('sent_emails', 'json') || [];
  sent.push(email);
  await env.KV?.put('sent_emails', JSON.stringify(sent));

  return email;
}

// Proposals
async function getProposals(env) {
  const data = await env.KV?.get('proposals', 'json');
  return data || [];
}

async function createProposal(env, data) {
  const proposal = {
    id: Date.now(),
    ...data,
    created_at: new Date().toISOString(),
    status: 'draft'
  };

  const proposals = await getProposals(env);
  proposals.push(proposal);
  await env.KV?.put('proposals', JSON.stringify(proposals));
  return proposal;
}

// Settings
async function getSettings(env) {
  const data = await env.KV?.get('settings', 'json');
  return data || { theme: 'dark', notifications: true };
}

async function updateSettings(env, data) {
  await env.KV?.put('settings', JSON.stringify(data));
  return data;
}

// ═══════════════════════════════════════════════════════════════
// SAMPLE DATA
// ═══════════════════════════════════════════════════════════════
function getSampleCustomers() {
  return [
    { id: 1, name: 'John Smith', email: 'john@techcorp.com', phone: '555-0101', company: 'TechCorp Inc', status: 'active', priority: 'high', revenue: 45000, projects: 3, lastContact: '2026-02-20' },
    { id: 2, name: 'Sarah Johnson', email: 'sarah@designstudio.com', phone: '555-0102', company: 'Design Studio', status: 'active', priority: 'medium', revenue: 28000, projects: 2, lastContact: '2026-02-18' },
    { id: 3, name: 'Mike Williams', email: 'mike@buildright.com', phone: '555-0103', company: 'BuildRight LLC', status: 'pending', priority: 'high', revenue: 62000, projects: 4, lastContact: '2026-02-15' }
  ];
}

function getSampleEmails() {
  return [
    { id: 1, from: 'client@example.com', subject: 'Project Update Request', body: 'Please send the latest project status...', date: '2026-02-23', read: false },
    { id: 2, from: 'support@vendor.com', subject: 'Invoice #12345', body: 'Your invoice is attached...', date: '2026-02-22', read: true }
  ];
}
