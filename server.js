const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const db = new Database('parking.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS Pricing_Rules (
    rule_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_type TEXT NOT NULL,
    is_peak_hour INTEGER NOT NULL DEFAULT 0,
    rate_per_hour REAL NOT NULL,
    UNIQUE(vehicle_type, is_peak_hour)
  );

  CREATE TABLE IF NOT EXISTS Parking_Spots (
    spot_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    floor_number INTEGER NOT NULL,
    spot_code    TEXT NOT NULL UNIQUE,
    vehicle_type TEXT NOT NULL,
    is_occupied  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS Tickets (
    ticket_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    spot_id       INTEGER NOT NULL,
    plate_number  TEXT NOT NULL,
    owner_name    TEXT,
    vehicle_type  TEXT NOT NULL,
    entry_time    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    exit_time     TEXT,
    duration_mins INTEGER,
    final_fee     REAL,
    status        TEXT NOT NULL DEFAULT 'active',
    FOREIGN KEY (spot_id) REFERENCES Parking_Spots(spot_id)
  );
`);

// ── Migration: add owner_name if missing ──
try { db.exec(`ALTER TABLE Tickets ADD COLUMN owner_name TEXT`); } catch(_) {}

// ── Seed pricing rules ──
db.exec(`
  INSERT OR IGNORE INTO Pricing_Rules (vehicle_type, is_peak_hour, rate_per_hour) VALUES
    ('2-wheeler', 0, 20.0),
    ('2-wheeler', 1, 35.0),
    ('4-wheeler', 0, 50.0),
    ('4-wheeler', 1, 80.0),
    ('truck',     0, 120.0),
    ('truck',     1, 180.0),
    ('bus',       0, 150.0),
    ('bus',       1, 220.0);
`);

// ── Seed parking spots ──
const spotCount = db.prepare('SELECT COUNT(*) as c FROM Parking_Spots').get().c;
if (spotCount === 0) {
  const insertSpot = db.prepare(
    'INSERT INTO Parking_Spots (floor_number, spot_code, vehicle_type) VALUES (?, ?, ?)'
  );
  const seedSpots = db.transaction(() => {
    for (let i = 1; i <= 5; i++) {
      const n = String(i).padStart(2, '0');
      insertSpot.run(0, `G0-2W-${n}`, '2-wheeler');
      insertSpot.run(0, `G0-4W-${n}`, '4-wheeler');
      insertSpot.run(0, `G0-TK-${n}`, 'truck');
      insertSpot.run(0, `G0-BS-${n}`, 'bus');
    }
    for (let f = 1; f <= 2; f++) {
      for (let i = 1; i <= 5; i++) {
        const n = String(i).padStart(2, '0');
        insertSpot.run(f, `F${f}-2W-${n}`, '2-wheeler');
        insertSpot.run(f, `F${f}-4W-${n}`, '4-wheeler');
      }
    }
  });
  seedSpots();
} else {
  const groundCount = db.prepare("SELECT COUNT(*) as c FROM Parking_Spots WHERE floor_number = 0").get().c;
  if (groundCount === 0) {
    const insertSpot = db.prepare(
      'INSERT INTO Parking_Spots (floor_number, spot_code, vehicle_type) VALUES (?, ?, ?)'
    );
    const addGround = db.transaction(() => {
      for (let i = 1; i <= 5; i++) {
        const n = String(i).padStart(2, '0');
        insertSpot.run(0, `G0-2W-${n}`, '2-wheeler');
        insertSpot.run(0, `G0-4W-${n}`, '4-wheeler');
        insertSpot.run(0, `G0-TK-${n}`, 'truck');
        insertSpot.run(0, `G0-BS-${n}`, 'bus');
      }
    });
    addGround();
  }
}

// ── Pricing config ────────────────────────────────────────────
const GST_RATE     = 0.18;
const PEAK_WINDOWS = [[8, 10], [17, 20]]; // 8–10am, 5–8pm

function isPeakHourAt(hour) {
  return PEAK_WINDOWS.some(([start, end]) => hour >= start && hour < end);
}

// ── Hour-by-hour fee calculator with GST ─────────────────────
function calculateFee(vehicleType, entryTime, exitTime) {
  let current = new Date(entryTime);
  const end   = new Date(exitTime);

  // Minimum 30 mins billing
  const durationMins = Math.max((end - current) / 60000, 30);
  const adjustedEnd  = new Date(current.getTime() + durationMins * 60000);

  let baseFee = 0;
  const breakdown = [];

  while (current < adjustedEnd) {
    // Next hour boundary
    const nextHour = new Date(current);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);

    const segmentEnd   = nextHour < adjustedEnd ? nextHour : adjustedEnd;
    const segmentHours = (segmentEnd - current) / 3600000;
    const hour         = current.getHours();
    const peak         = isPeakHourAt(hour);

    const rule = db.prepare(
      `SELECT rate_per_hour FROM Pricing_Rules WHERE vehicle_type = ? AND is_peak_hour = ?`
    ).get(vehicleType, peak ? 1 : 0);

    const rate = rule ? rule.rate_per_hour : 20;
    const cost = Math.round(segmentHours * rate * 100) / 100;

    breakdown.push({
      from:    current.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      to:      segmentEnd.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      rate,
      hours:   Math.round(segmentHours * 100) / 100,
      cost,
      is_peak: peak,
    });

    baseFee += cost;
    current  = segmentEnd;
  }

  baseFee         = Math.round(baseFee * 100) / 100;
  const gstAmount = Math.round(baseFee * GST_RATE * 100) / 100;
  const totalFee  = Math.round((baseFee + gstAmount) * 100) / 100;

  return {
    baseFee,
    gstAmount,
    totalFee,
    breakdown,
    wasPeak: breakdown.some(b => b.is_peak),
  };
}

// ── POST /api/entry ──────────────────────────────────────────
app.post('/api/entry', (req, res) => {
  const { plate_number, vehicle_type, owner_name } = req.body;
  if (!plate_number || !vehicle_type)
    return res.status(400).json({ error: 'plate_number and vehicle_type are required.' });

  const spot = db.prepare(
    `SELECT spot_id, spot_code, floor_number
       FROM Parking_Spots
      WHERE vehicle_type = ? AND is_occupied = 0
      ORDER BY floor_number, spot_code
      LIMIT 1`
  ).get(vehicle_type);

  if (!spot)
    return res.status(409).json({ error: `No free spots available for ${vehicle_type}.` });

  const doEntry = db.transaction(() => {
    db.prepare('UPDATE Parking_Spots SET is_occupied = 1 WHERE spot_id = ?').run(spot.spot_id);
    const result = db.prepare(
      `INSERT INTO Tickets (spot_id, plate_number, owner_name, vehicle_type) VALUES (?, ?, ?, ?)`
    ).run(spot.spot_id, plate_number.toUpperCase(), owner_name || null, vehicle_type);
    return result.lastInsertRowid;
  });

  const ticketId = doEntry();
  res.status(201).json({
    message:    'Entry logged.',
    ticket_id:  ticketId,
    spot_code:  spot.spot_code,
    floor:      spot.floor_number,
    entry_time: new Date().toISOString(),
    owner_name: owner_name || null,
  });
});

// ── POST /api/exit ───────────────────────────────────────────
app.post('/api/exit', (req, res) => {
  const { ticket_id } = req.body;
  if (!ticket_id)
    return res.status(400).json({ error: 'ticket_id is required.' });

  const ticket = db.prepare(
    `SELECT * FROM Tickets WHERE ticket_id = ? AND status = 'active'`
  ).get(ticket_id);

  if (!ticket)
    return res.status(404).json({ error: 'Ticket not found or already closed.' });

  const entryTime    = new Date(ticket.entry_time);
  const exitTime     = new Date();
  const durationMins = Math.floor((exitTime - entryTime) / 60000);
  const pricing      = calculateFee(ticket.vehicle_type, entryTime, exitTime);

  db.transaction(() => {
    db.prepare(
      `UPDATE Tickets
          SET exit_time = ?, duration_mins = ?, final_fee = ?, status = 'closed'
        WHERE ticket_id = ?`
    ).run(exitTime.toISOString(), durationMins, pricing.totalFee, ticket_id);
    db.prepare('UPDATE Parking_Spots SET is_occupied = 0 WHERE spot_id = ?')
      .run(ticket.spot_id);
  })();

  const spot = db.prepare(
    'SELECT spot_code, floor_number FROM Parking_Spots WHERE spot_id = ?'
  ).get(ticket.spot_id);

  const baseRule = db.prepare(
    `SELECT rate_per_hour FROM Pricing_Rules WHERE vehicle_type = ? AND is_peak_hour = 0`
  ).get(ticket.vehicle_type);

  res.json({
    message:       'Exit processed.',
    ticket_id:     Number(ticket_id),
    plate_number:  ticket.plate_number,
    owner_name:    ticket.owner_name || null,
    vehicle_type:  ticket.vehicle_type,
    spot_code:     spot ? spot.spot_code : '—',
    floor:         spot ? spot.floor_number : '—',
    entry_time:    ticket.entry_time,
    exit_time:     exitTime.toISOString(),
    duration_mins: durationMins,
    rate_per_hour: baseRule ? baseRule.rate_per_hour : 0,
    base_fee:      pricing.baseFee,
    gst_amount:    pricing.gstAmount,
    gst_rate:      GST_RATE * 100,
    final_fee:     pricing.totalFee,
    was_peak:      pricing.wasPeak,
    breakdown:     pricing.breakdown,
  });
});

// ── GET /api/capacity ────────────────────────────────────────
app.get('/api/capacity', (req, res) => {
  const spots = db.prepare(
    `SELECT spot_id, floor_number, spot_code, vehicle_type, is_occupied
       FROM Parking_Spots ORDER BY floor_number, spot_code`
  ).all();

  const capacity = spots.reduce((acc, s) => {
    const key = `floor_${s.floor_number}`;
    if (!acc[key]) acc[key] = { total: 0, occupied: 0, spots: [] };
    acc[key].total++;
    if (s.is_occupied) acc[key].occupied++;
    acc[key].spots.push({
      spot_id:      s.spot_id,
      spot_code:    s.spot_code,
      vehicle_type: s.vehicle_type,
      is_occupied:  !!s.is_occupied,
    });
    return acc;
  }, {});

  res.json({ capacity });
});

// ── GET /api/active-tickets ──────────────────────────────────
app.get('/api/active-tickets', (req, res) => {
  const tickets = db.prepare(`
    SELECT t.ticket_id, t.plate_number, t.owner_name, t.vehicle_type,
           t.entry_time, s.spot_code, s.floor_number
    FROM Tickets t
    JOIN Parking_Spots s ON t.spot_id = s.spot_id
    WHERE t.status = 'active'
    ORDER BY t.entry_time ASC
  `).all();
  res.json({ tickets });
});

// ── GET /api/recent-activity ─────────────────────────────────
app.get('/api/recent-activity', (req, res) => {
  const logs = db.prepare(`
    SELECT t.ticket_id, t.plate_number, t.vehicle_type,
           t.entry_time, t.exit_time, t.final_fee,
           t.duration_mins, t.status, s.spot_code
    FROM Tickets t
    JOIN Parking_Spots s ON t.spot_id = s.spot_id
    ORDER BY t.ticket_id DESC
    LIMIT 10
  `).all();
  res.json({ logs });
});

// ── GET /api/revenue ─────────────────────────────────────────
app.get('/api/revenue', (req, res) => {
  const row = db.prepare(`
    SELECT
      ROUND(SUM(final_fee), 2) as total_revenue,
      COUNT(*) as total_closed,
      ROUND(AVG(final_fee), 2) as avg_fee,
      ROUND(SUM(CASE WHEN vehicle_type='4-wheeler' THEN final_fee ELSE 0 END), 2) as car_revenue,
      ROUND(SUM(CASE WHEN vehicle_type='2-wheeler' THEN final_fee ELSE 0 END), 2) as bike_revenue,
      ROUND(SUM(CASE WHEN vehicle_type='truck'     THEN final_fee ELSE 0 END), 2) as truck_revenue,
      ROUND(SUM(CASE WHEN vehicle_type='bus'       THEN final_fee ELSE 0 END), 2) as bus_revenue
    FROM Tickets
    WHERE status = 'closed'
    AND DATE(datetime(exit_time, 'localtime')) = DATE('now', 'localtime')
  `).get();
  res.json(row);
});

// ── GET /api/revenue-graph ───────────────────────────────────
app.get('/api/revenue-graph', (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const rows = db.prepare(`
    SELECT
      DATE(datetime(exit_time, 'localtime')) as day,
      ROUND(SUM(final_fee), 2) as revenue,
      COUNT(*) as vehicles
    FROM Tickets
    WHERE status = 'closed'
      AND datetime(exit_time, 'localtime') >= DATE('now', 'localtime', '-${days} days')
    GROUP BY DATE(datetime(exit_time, 'localtime'))
    ORDER BY day ASC
  `).all();

  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().split('T')[0];
    const found  = rows.find(r => r.day === dayStr);
    result.push({
      day:      dayStr,
      revenue:  found ? found.revenue : 0,
      vehicles: found ? found.vehicles : 0,
    });
  }
  res.json({ graph: result });
});

// ── GET /api/search/:plate ────────────────────────────────────
app.get('/api/search/:plate', (req, res) => {
  const tickets = db.prepare(`
    SELECT t.*, s.spot_code, s.floor_number
    FROM Tickets t
    JOIN Parking_Spots s ON t.spot_id = s.spot_id
    WHERE t.plate_number LIKE ?
    ORDER BY t.ticket_id DESC
    LIMIT 5
  `).all(`%${req.params.plate.toUpperCase()}%`);
  res.json({ tickets });
});

// ── GET /api/export-csv ──────────────────────────────────────
app.get('/api/export-csv', (req, res) => {
  const tickets = db.prepare(`
    SELECT t.ticket_id, t.plate_number, t.vehicle_type,
           s.spot_code, s.floor_number,
           t.entry_time, t.exit_time, t.duration_mins,
           t.final_fee, t.status
    FROM Tickets t
    JOIN Parking_Spots s ON t.spot_id = s.spot_id
    ORDER BY t.ticket_id DESC
  `).all();

  const headers = ['Ticket ID','Plate Number','Vehicle Type','Spot Code','Floor','Entry Time','Exit Time','Duration (mins)','Final Fee (₹)','Status'];
  const rows = tickets.map(t => [
    t.ticket_id, t.plate_number, t.vehicle_type,
    t.spot_code, t.floor_number,
    t.entry_time || '', t.exit_time || '',
    t.duration_mins !== null ? t.duration_mins : '',
    t.final_fee  !== null ? t.final_fee : '',
    t.status,
  ]);

  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="parking_export_${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
});

app.listen(3000, () => console.log('🚗 Parking API running on http://localhost:3000'));