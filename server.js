const express = require('express');
//const sqlite3 = require('sqlite3').verbose();
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
/**
// Initialize SQLite Database
const db = new sqlite3.Database('./orders.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Create tables if they don't exist
function initializeDatabase() {
    db.run(`
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
    `, (err) => {
        if (err) console.error('Error creating orders table:', err);
    });

    db.run(`
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
    `, (err) => {
        if (err) console.error('Error creating order_items table:', err);
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'staff',
            created_at TEXT NOT NULL,
            last_login TEXT
        )
    `, (err) => {
        if (err) {
            console.error('Error creating employees table:', err);
        } else {
            // Create default admin account if no employees exist
            db.get('SELECT COUNT(*) as count FROM employees', async (err, row) => {
                if (!err && row.count === 0) {
                    const defaultPassword = await bcrypt.hash('admin123', 10);
                    db.run(`
                        INSERT INTO employees (employee_id, password_hash, name, role, created_at)
                        VALUES (?, ?, ?, ?, ?)
                    `, ['admin', defaultPassword, 'Administrator', 'admin', new Date().toISOString()], (err) => {
                        if (!err) {
                            console.log('✅ Default admin account created');
                            console.log('   Employee ID: admin');
                            console.log('   Password: admin123');
                            console.log('   ⚠️  Please change this password immediately!');
                        }
                    });
                }
            });
        }
    });
}
***/

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.employeeId) {
        return next();
    }
    res.redirect('/login');
}

// Check if user is authenticated (for API calls)
function requireAuthAPI(req, res, next) {
    if (req.session && req.session.employeeId) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
}

// Generate order number
function generateOrderNumber() {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ORD-${dateStr}-${randomStr}`;
}

// Web Routes

// Customer ordering page (no auth required)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login page
app.get('/login', (req, res) => {
    if (req.session && req.session.employeeId) {
        return res.redirect('/dashboard');
    }
    res.render('login', { error: null });
});

// Login handler
app.post('/login', async (req, res) => {
    const { employeeId, password } = req.body;

    if (!employeeId || !password) {
        return res.render('login', { error: 'Please enter both Employee ID and Password' });
    }else{
                    // Set session
        req.session.employeeId = 1;
        req.session.employeeName = 'admin';
        req.session.employeeRole = 'admin123';

        res.redirect('/dashboard');
    }

    /***db.get(
        'SELECT * FROM employees WHERE employee_id = ?',
        [employeeId],
        async (err, employee) => {
            if (err) {
                console.error('Database error:', err);
                return res.render('login', { error: 'An error occurred. Please try again.' });
            }

            if (!employee) {
                return res.render('login', { error: 'Invalid Employee ID or Password' });
            }

            const passwordMatch = await bcrypt.compare(password, employee.password_hash);

            if (!passwordMatch) {
                return res.render('login', { error: 'Invalid Employee ID or Password' });
            }

            // Update last login
            db.run(
                'UPDATE employees SET last_login = ? WHERE id = ?',
                [new Date().toISOString(), employee.id]
            );

            // Set session
            req.session.employeeId = employee.employee_id;
            req.session.employeeName = employee.name;
            req.session.employeeRole = employee.role;

            res.redirect('/dashboard');
        }
    );***/
});

// Logout handler
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/login');
    });
});

// Dashboard page (protected)
app.get('/dashboard', requireAuth, (req, res) => {
    res.render('dashboard', {
        employeeName: req.session.employeeName,
        employeeRole: req.session.employeeRole
    });
});

// Employee management page (admin only)
app.get('/employees', requireAuth, (req, res) => {
    if (req.session.employeeRole !== 'admin') {
        return res.status(403).send('Access denied. Admin only.');
    }

    /***db.all('SELECT id, employee_id, name, role, created_at, last_login FROM employees ORDER BY created_at DESC', (err, employees) => {
        if (err) {
            console.error('Error fetching employees:', err);
            return res.status(500).send('Error loading employees');
        }

        res.render('employees', {
            employeeName: req.session.employeeName,
            employees: employees
        });
    });***/
});

// API Routes (all protected)

// Submit new order (public API - no auth required)
app.post('/api/orders', (req, res) => {
    const order = req.body;
    const orderNumber = generateOrderNumber();

    /***db.serialize(() => {
        const orderStmt = db.prepare(`
            INSERT INTO orders (order_number, table_number, customer_name, customer_phone, special_instructions, total, timestamp, location)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        orderStmt.run(
            orderNumber,
            order.tableNumber,  // Add table number here
            order.customer.name,
            order.customer.phone,
            order.customer.specialInstructions || '',
            order.total,
            order.timestamp,
            order.location,
            function(err) {
                if (err) {
                    console.error('Error inserting order:', err);
                    return res.status(500).json({ error: 'Failed to place order' });
                }

                const orderId = this.lastID;

                const itemStmt = db.prepare(`
                    INSERT INTO order_items (order_id, item_name, size, price, quantity, subtotal)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);

                order.items.forEach(item => {
                    itemStmt.run(orderId, item.name, item.size, item.price, item.quantity, item.subtotal);
                });

                itemStmt.finalize();

                res.json({ 
                    success: true, 
                    orderNumber: orderNumber,
                    orderId: orderId
                });
            }
        );

        orderStmt.finalize();
    });***/
});

// Get all orders (protected)
app.get('/api/orders', requireAuthAPI, (req, res) => {
    const status = req.query.status;
    let query = `SELECT * FROM orders`;
    
    if (status) {
        query += ` WHERE status = ?`;
    }
    
    query += ` ORDER BY timestamp DESC`;

    /***db.all(query, status ? [status] : [], (err, orders) => {
        if (err) {
            console.error('Error fetching orders:', err);
            return res.status(500).json({ error: 'Failed to fetch orders' });
        }

        const ordersWithItems = [];
        let processed = 0;

        if (orders.length === 0) {
            return res.json([]);
        }

        orders.forEach(order => {
            db.all(
                'SELECT * FROM order_items WHERE order_id = ?',
                [order.id],
                (err, items) => {
                    if (err) {
                        console.error('Error fetching order items:', err);
                    }

                    ordersWithItems.push({
                        ...order,
                        items: items || []
                    });

                    processed++;
                    if (processed === orders.length) {
                        res.json(ordersWithItems);
                    }
                }
            );
        });
    });***/
});

// Get single order (protected)
app.get('/api/orders/:id', requireAuthAPI, (req, res) => {
    const orderId = req.params.id;

    /***db.get('SELECT * FROM orders WHERE id = ?', [orderId], (err, order) => {
        if (err) {
            console.error('Error fetching order:', err);
            return res.status(500).json({ error: 'Failed to fetch order' });
        }

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId], (err, items) => {
            if (err) {
                console.error('Error fetching order items:', err);
                return res.status(500).json({ error: 'Failed to fetch order items' });
            }

            res.json({
                ...order,
                items: items
            });
        });
    });***/
});

// get qr code
app.get('/qr-codes', requireAuth, (req, res) => {
    res.render('qr-generator');
});

// Update order status (protected)
app.patch('/api/orders/:id/status', requireAuthAPI, (req, res) => {
    const orderId = req.params.id;
    const { status } = req.body;

    const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    /***db.run(
        'UPDATE orders SET status = ? WHERE id = ?',
        [status, orderId],
        function(err) {
            if (err) {
                console.error('Error updating order status:', err);
                return res.status(500).json({ error: 'Failed to update order status' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Order not found' });
            }

            res.json({ success: true, status: status });
        }
    );***/
});

// Delete order (protected)
app.delete('/api/orders/:id', requireAuthAPI, (req, res) => {
    const orderId = req.params.id;

    /***db.serialize(() => {
        db.run('DELETE FROM order_items WHERE order_id = ?', [orderId]);
        db.run('DELETE FROM orders WHERE id = ?', [orderId], function(err) {
            if (err) {
                console.error('Error deleting order:', err);
                return res.status(500).json({ error: 'Failed to delete order' });
            }

            res.json({ success: true });
        });
    });***/
});

// Employee Management APIs (admin only)

// Add new employee
app.post('/api/employees', requireAuthAPI, async (req, res) => {
    if (req.session.employeeRole !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    const { employeeId, password, name, role } = req.body;

    if (!employeeId || !password || !name) {
        return res.status(400).json({ error: 'Employee ID, password, and name are required' });
    }

    /***try {
        const passwordHash = await bcrypt.hash(password, 10);

        db.run(
            `INSERT INTO employees (employee_id, password_hash, name, role, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [employeeId, passwordHash, name, role || 'staff', new Date().toISOString()],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: 'Employee ID already exists' });
                    }
                    console.error('Error creating employee:', err);
                    return res.status(500).json({ error: 'Failed to create employee' });
                }

                res.json({ success: true, employeeId: this.lastID });
            }
        );
    } catch (error) {
        console.error('Error hashing password:', error);
        res.status(500).json({ error: 'Failed to create employee' });
    }***/
});

// Delete employee
app.delete('/api/employees/:id', requireAuthAPI, (req, res) => {
    if (req.session.employeeRole !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    const employeeId = req.params.id;
    /***
    // Prevent deleting yourself
    db.get('SELECT employee_id FROM employees WHERE id = ?', [employeeId], (err, employee) => {
        if (err || !employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        if (employee.employee_id === req.session.employeeId) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        db.run('DELETE FROM employees WHERE id = ?', [employeeId], function(err) {
            if (err) {
                console.error('Error deleting employee:', err);
                return res.status(500).json({ error: 'Failed to delete employee' });
            }

            res.json({ success: true });
        });
    });***/
});

// Change password
app.post('/api/change-password', requireAuthAPI, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    /***db.get(
        'SELECT * FROM employees WHERE employee_id = ?',
        [req.session.employeeId],
        async (err, employee) => {
            if (err || !employee) {
                return res.status(500).json({ error: 'Error verifying password' });
            }

            const passwordMatch = await bcrypt.compare(currentPassword, employee.password_hash);

            if (!passwordMatch) {
                return res.status(400).json({ error: 'Current password is incorrect' });
            }

            const newPasswordHash = await bcrypt.hash(newPassword, 10);

            db.run(
                'UPDATE employees SET password_hash = ? WHERE id = ?',
                [newPasswordHash, employee.id],
                function(err) {
                    if (err) {
                        console.error('Error updating password:', err);
                        return res.status(500).json({ error: 'Failed to update password' });
                    }

                    res.json({ success: true });
                }
            );
        }
    );***/
});

// Start server
app.listen(PORT,() => {
    console.log(`Server running `);
    console.log(`Dashboard available at http://localhost:${PORT}/dashboard`);
    //console.log(`Customer page available at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    /***db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed');
        }
        process.exit(0);
    });***/
});