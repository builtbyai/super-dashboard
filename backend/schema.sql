-- Super Dashboard Database Schema

-- Customers Table
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
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

-- Invoices Table
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
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Proposals Table
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
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Emails Table
CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_address TEXT,
    to_address TEXT,
    subject TEXT,
    body TEXT,
    html_body TEXT,
    status TEXT DEFAULT 'inbox',
    is_read INTEGER DEFAULT 0,
    is_starred INTEGER DEFAULT 0,
    attachments TEXT,
    thread_id TEXT,
    received_at TEXT DEFAULT (datetime('now')),
    sent_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Calendar Events Table
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
    is_recurring INTEGER DEFAULT 0,
    recurrence_rule TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo',
    priority TEXT DEFAULT 'medium',
    due_date TEXT,
    assigned_to TEXT,
    customer_id INTEGER,
    project_id INTEGER,
    tags TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Files Table (metadata, actual files in R2)
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT,
    mime_type TEXT,
    size INTEGER,
    r2_key TEXT UNIQUE NOT NULL,
    customer_id INTEGER,
    invoice_id INTEGER,
    folder TEXT DEFAULT 'general',
    uploaded_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

-- WebRTC Rooms Table
CREATE TABLE IF NOT EXISTS webrtc_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT UNIQUE NOT NULL,
    room_name TEXT,
    host_id TEXT,
    status TEXT DEFAULT 'active',
    max_participants INTEGER DEFAULT 10,
    is_private INTEGER DEFAULT 0,
    password_hash TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT
);

-- Settings Table
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    category TEXT DEFAULT 'general',
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Signatures Table
CREATE TABLE IF NOT EXISTS signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    signature_data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Bookmarks Table
CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    folder TEXT DEFAULT 'general',
    icon TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_files_customer ON files(customer_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_rooms_id ON webrtc_rooms(room_id);
