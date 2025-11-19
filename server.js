const express = require('express');
const Database = require('better-sqlite3');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Session middleware
app.use(session({
    secret: 'barista-express-secret-key-change-this-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
        httpOnly: true
    }
}));

// Initialize SQLite Database
const db = new Database('./orders.db');

function initializeDatabase() {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number TEXT UNIQUE,
            table_number TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            customer_phone TEXT NOT NULL,
            special_instructions TEXT,
            total REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            timestamp TEXT NOT NULL,
            location TEXT
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER,
            item_name TEXT NOT NULL,
            size TEXT,
            price REAL NOT NULL,
            quantity INTEGER NOT NULL,
            subtotal REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'staff',
            created_at TEXT NOT NULL,
            last_login TEXT
        )
    `).run();

    // Create default admin if none exist
    const row = db.prepare(`SELECT COUNT(*) AS count FROM employees`).get();
    if (row.count === 0) {
        const pwd = bcrypt.hashSync('admin123', 10);
        db.prepare(`
            INSERT INTO employees (employee_id, password_hash, name, role, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).run('admin', pwd, 'Administrator', 'admin', new Date().toISOString());

        console.log('✅ Default admin created: admin / admin123');
    }
}

initializeDatabase();

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.employeeId) return next();
    res.redirect('/login');
}

function requireAuthAPI(req, res, next) {
    if (req.session && req.session.employeeId) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// Order number generator
function generateOrderNumber() {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ORD-${dateStr}-${randomStr}`;
}

/* -------------------------
     WEB ROUTES
-------------------------- */

// Customer ordering page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login page
app.get('/login', (req, res) => {
    if (req.session.employeeId) return res.redirect('/dashboard');
    res.render('login', { error: null });
});

// Login handler
app.post('/login', async (req, res) => {
    const { employeeId, password } = req.body;

    if (!employeeId || !password) {
        return res.render('login', { error: 'Please enter both Employee ID and Password' });
    }

    const employee = db.prepare(`
        SELECT * FROM employees WHERE employee_id = ?
    `).get(employeeId);

    if (!employee) {
        return res.render('login', { error: 'Invalid Employee ID or Password' });
    }

    const matches = await bcrypt.compare(password, employee.password_hash);
    if (!matches) {
        return res.render('login', { error: 'Invalid Employee ID or Password' });
    }

    // Update last login
    db.prepare(`UPDATE employees SET last_login = ? WHERE id = ?`)
      .run(new Date().toISOString(), employee.id);

    // Set session
    req.session.employeeId = employee.employee_id;
    req.session.employeeName = employee.name;
    req.session.employeeRole = employee.role;

    res.redirect('/dashboard');
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// Dashboard
app.get('/dashboard', requireAuth, (req, res) => {
    res.render('dashboard', {
        employeeName: req.session.employeeName,
        employeeRole: req.session.employeeRole
    });
});

// Employee management (admin)
app.get('/employees', requireAuth, (req, res) => {
    if (req.session.employeeRole !== 'admin') {
        return res.status(403).send('Access denied');
    }

    const employees = db.prepare(`
        SELECT id, employee_id, name, role, created_at, last_login 
        FROM employees 
        ORDER BY created_at DESC
    `).all();

    res.render('employees', {
        employeeName: req.session.employeeName,
        employees
    });
});

// QR Generator page
app.get('/qr-codes', requireAuth, (req, res) => {
    res.render('qr-generator');
});

/* -------------------------
     API ROUTES
-------------------------- */

// New order (public)
app.post('/api/orders', (req, res) => {
    const order = req.body;
    const orderNumber = generateOrderNumber();

    const insertOrder = db.prepare(`
        INSERT INTO orders (order_number, table_number, customer_name, customer_phone, special_instructions, total, timestamp, location)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = insertOrder.run(
        orderNumber,
        order.tableNumber,
        order.customer.name,
        order.customer.phone,
        order.customer.specialInstructions || '',
        order.total,
        order.timestamp,
        order.location
    );

    const orderId = info.lastInsertRowid;

    const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, item_name, size, price, quantity, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction(items => {
        for (const item of items) {
            insertItem.run(orderId, item.name, item.size, item.price, item.quantity, item.subtotal);
        }
    });

    insertMany(order.items);

    res.json({ success: true, orderNumber, orderId });
});

// Get orders
app.get('/api/orders', requireAuthAPI, (req, res) => {
    const status = req.query.status;

    let orders = [];
    if (status) {
        orders = db.prepare(`SELECT * FROM orders WHERE status = ? ORDER BY timestamp DESC`).all(status);
    } else {
        orders = db.prepare(`SELECT * FROM orders ORDER BY timestamp DESC`).all();
    }

    const getItems = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`);

    const full = orders.map(order => ({
        ...order,
        items: getItems.all(order.id)
    }));

    res.json(full);
});

// Get single order
app.get('/api/orders/:id', requireAuthAPI, (req, res) => {
    const orderId = req.params.id;

    const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(orderId);

    res.json({ ...order, items });
});

// Update status
app.patch('/api/orders/:id/status', requireAuthAPI, (req, res) => {
    const { status } = req.body;
    const orderId = req.params.id;

    const valid = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!valid.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    const result = db.prepare(`
        UPDATE orders SET status = ? WHERE id = ?
    `).run(status, orderId);

    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });

    res.json({ success: true, status });
});

// Delete order
app.delete('/api/orders/:id', requireAuthAPI, (req, res) => {
    const id = req.params.id;

    db.transaction(() => {
        db.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(id);
        db.prepare(`DELETE FROM orders WHERE id = ?`).run(id);
    })();

    res.json({ success: true });
});

/* -------------------------
     EMPLOYEE MANAGEMENT
-------------------------- */

// Add employee
app.post('/api/employees', requireAuthAPI, async (req, res) => {
    if (req.session.employeeRole !== 'admin') {
        return res.status(403).json({ error: 'Admin only' });
    }

    const { employeeId, password, name, role } = req.body;

    const exists = db.prepare(`SELECT 1 FROM employees WHERE employee_id = ?`).get(employeeId);
    if (exists) return res.status(400).json({ error: 'Employee ID already exists' });

    const hash = await bcrypt.hash(password, 10);

    const info = db.prepare(`
        INSERT INTO employees (employee_id, password_hash, name, role, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(employeeId, hash, name, role || 'staff', new Date().toISOString());

    res.json({ success: true, employeeId: info.lastInsertRowid });
});

// Delete employee
app.delete('/api/employees/:id', requireAuthAPI, (req, res) => {
    if (req.session.employeeRole !== 'admin') {
        return res.status(403).json({ error: 'Admin only' });
    }

    const id = req.params.id;

    const employee = db.prepare(`SELECT employee_id FROM employees WHERE id = ?`).get(id);
    if (!employee) return res.status(404).json({ error: 'Not found' });

    if (employee.employee_id === req.session.employeeId) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    db.prepare(`DELETE FROM employees WHERE id = ?`).run(id);

    res.json({ success: true });
});

// Change password
app.post('/api/change-password', requireAuthAPI, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const employee = db.prepare(`
        SELECT * FROM employees WHERE employee_id = ?
    `).get(req.session.employeeId);

    const matches = await bcrypt.compare(currentPassword, employee.password_hash);
    if (!matches) return res.status(400).json({ error: 'Incorrect current password' });

    const newHash = await bcrypt.hash(newPassword, 10);

    db.prepare(`
        UPDATE employees SET password_hash = ? WHERE id = ?
    `).run(newHash, employee.id);

    res.json({ success: true });
});

/* -------------------------
     START SERVER
-------------------------- */

app.listen(PORT, () => {
    //console.log(`Server running: http://localhost:${PORT}`);
    //console.log(`Dashboard:      http://localhost:${PORT}/dashboard`);
    //console.log(`Customer page:  http://localhost:${PORT}`);
    console.log(`Server running`);
});
// Graceful shutdown ////////
process.on('SIGINT', () => {
    console.log('Closing database...');
    db.close();
    process.exit(0);
});
