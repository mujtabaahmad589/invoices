const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use(session({
    secret: 'payshield_secret_key_123',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

const db = new sqlite3.Database('./app_db.db', (err) => {
    if (err) console.error('خطأ في قاعدة البيانات:', err.message);
    else console.log('تم الاتصال بقاعدة البيانات بنجاح');
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            customer_code TEXT,
            phone TEXT NOT NULL,
            purchase_date TEXT,
            total_amount REAL NOT NULL,
            down_payment REAL DEFAULT 0,
            paid_down_payment REAL DEFAULT 0,
            installments_count INTEGER NOT NULL,
            agent_name TEXT,
            agent_rate REAL DEFAULT 0,
            coordinator_name TEXT,
            coordinator_rate REAL DEFAULT 0,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`ALTER TABLE contracts ADD COLUMN customer_code TEXT`, () => {});

    db.run(`
        CREATE TABLE IF NOT EXISTS team_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            default_rate REAL DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS installments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_id INTEGER,
            due_date TEXT NOT NULL,
            amount REAL NOT NULL,
            paid_amount REAL DEFAULT 0,
            status TEXT DEFAULT 'PENDING',
            FOREIGN KEY (contract_id) REFERENCES contracts(id)
        )
    `);

    db.run(`ALTER TABLE installments ADD COLUMN paid_amount REAL DEFAULT 0`, () => {});
});

function checkAuth(req, res, next) {
    if (req.session && req.session.isLoggedIn) {
        return next();
    }
    return res.status(401).json({ error: 'غير مصرح! يرجى تسجيل الدخول أولاً.' });
}

app.get('/api/check-auth', (req, res) => {
    if (req.session && req.session.isLoggedIn) {
        res.json({ isLoggedIn: true, username: req.session.username });
    } else {
        res.json({ isLoggedIn: false });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '123456') {
        req.session.isLoggedIn = true;
        req.session.username = username;
        return res.json({ message: 'تم تسجيل الدخول بنجاح' });
    } else {
        return res.status(400).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة!' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ message: 'تم تسجيل الخروج بنجاح' });
    });
});

app.get('/api/team-members', checkAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    db.all(`SELECT * FROM team_members ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/team-members', checkAuth, (req, res) => {
    const { name, type, default_rate } = req.body;
    if (!name || !name.trim() || !type) return res.status(400).json({ error: 'بيانات غير مكتملة' });

    db.run(
        `INSERT INTO team_members (name, type, default_rate) VALUES (?, ?, ?)`,
        [name.trim(), type, parseFloat(default_rate) || 0],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'تم الحفظ', id: this.lastID });
        }
    );
});

app.get('/api/data', checkAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const query = `
        SELECT c.id as contract_id, c.customer_name, c.customer_code, c.phone, c.purchase_date, c.total_amount, c.down_payment, 
               IFNULL(c.paid_down_payment, 0) as paid_down_payment,
               c.agent_name, c.agent_rate, c.coordinator_name, c.coordinator_rate, c.notes,
               i.id as installment_id, i.due_date, i.amount, IFNULL(i.paid_amount, 0) as paid_amount, i.status
        FROM contracts c
        LEFT JOIN installments i ON c.id = i.contract_id
        ORDER BY c.id DESC, i.due_date ASC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/contracts', checkAuth, (req, res) => {
    const { 
        customer_name, customer_code, phone, purchase_date, total_amount, down_payment, paid_down_payment, 
        installments_count, start_date, agent_name, agent_rate, coordinator_name, coordinator_rate, notes 
    } = req.body;
    
    const total = parseFloat(total_amount);
    const down = parseFloat(down_payment);
    const paidDown = parseFloat(paid_down_payment);
    const totalPayments = parseInt(installments_count);

    if (!customer_name || !phone || isNaN(total) || isNaN(down) || isNaN(paidDown) || isNaN(totalPayments) || !start_date) {
        return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    const pDate = purchase_date || new Date().toISOString().split('T')[0];
    const remainingTotal = total - down;
    const remainingInstCount = totalPayments > 1 ? totalPayments - 1 : 1;
    const instAmount = (remainingTotal / remainingInstCount).toFixed(2);

    db.run(
        `INSERT INTO contracts (
            customer_name, customer_code, phone, purchase_date, total_amount, down_payment, paid_down_payment, installments_count,
            agent_name, agent_rate, coordinator_name, coordinator_rate, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            customer_name, customer_code || '', phone, pDate, total, down, paidDown, totalPayments,
            agent_name || '', parseFloat(agent_rate) || 0, coordinator_name || '', parseFloat(coordinator_rate) || 0, notes || ''
        ],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            const contractId = this.lastID;

            let startDate = new Date(start_date);
            const stmt = db.prepare(`INSERT INTO installments (contract_id, due_date, amount, paid_amount) VALUES (?, ?, ?, 0)`);

            for (let i = 0; i < remainingInstCount; i++) {
                let dueDate = new Date(startDate);
                dueDate.setMonth(dueDate.getMonth() + i);
                stmt.run(contractId, dueDate.toISOString().split('T')[0], instAmount);
            }
            stmt.finalize();

            res.json({ message: 'تم حفظ العقد بنجاح', contractId });
        }
    );
});

app.post('/api/pay-installment', checkAuth, (req, res) => {
    const { installment_id, amount } = req.body;
    const payAmount = parseFloat(amount) || 0;

    if (!installment_id || payAmount <= 0) {
        return res.status(400).json({ error: 'يرجى إدخال مبلغ أكبر من الصفر' });
    }

    db.get(`SELECT amount, IFNULL(paid_amount, 0) as paid_amount FROM installments WHERE id = ?`, [installment_id], (err, row) => {
        if (err || !row) return res.status(400).json({ error: 'القسط غير موجود' });

        const newPaid = row.paid_amount + payAmount;
        const newStatus = newPaid >= row.amount ? 'PAID' : 'PARTIAL';

        db.run(
            `UPDATE installments SET paid_amount = ?, status = ? WHERE id = ?`,
            [newPaid, newStatus, installment_id],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'تم تسجيل السداد بنجاح' });
            }
        );
    });
});

app.post('/api/pay-down-payment', checkAuth, (req, res) => {
    const { contract_id, amount } = req.body;
    const payAmount = parseFloat(amount) || 0;

    if (!contract_id || payAmount <= 0) {
        return res.status(400).json({ error: 'يرجى إدخال مبلغ أكبر من الصفر' });
    }

    db.run(
        `UPDATE contracts SET paid_down_payment = IFNULL(paid_down_payment, 0) + ? WHERE id = ?`,
        [payAmount, contract_id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'تم تسجيل سداد مبلغ الدفعة بنجاح!' });
        }
    );
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على الرابط: http://localhost:${PORT}`);
});