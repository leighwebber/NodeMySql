const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');


const app = express();
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv').config();
const cookieParser = require('cookie-parser');
const path = require('path');
const PORT = 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '200mb', extended: true}));
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(cookieParser());

const verifyToken = (req, res, next) => {
    // 1. Get the token from the cookie
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ message: "No token provided" });
    }

    // 2. Verify the token
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: "Invalid or expired token" });
        }
        // 3. Attach the user data to the request object for use in routes
        req.user = decoded; 
        next();
    });
};

// MySQL Connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'lwebber',
  password: '12qwQW!!',
  database: 'playblocker'
});

db.connect(err => {
  if (err) throw err;
  console.log('✅ MySQL Connected!');
  db.query(`
    CREATE TABLE IF NOT EXISTS movement_speaker_position (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      movement_id INT NOT NULL,
      speaker_id  INT NOT NULL,
      rp_x        DECIMAL(10,8) NOT NULL,
      rp_y        DECIMAL(10,8) NOT NULL,
      FOREIGN KEY (movement_id) REFERENCES movement(id) ON DELETE CASCADE,
      FOREIGN KEY (speaker_id)  REFERENCES speaker(id)  ON DELETE CASCADE
    )
  `, err => { if (err) console.error('movement_speaker_position create error:', err); });

  // Add production_id to speaker and movement if not already present (errno 1060 = duplicate column)
  db.query('ALTER TABLE speaker  ADD COLUMN production_id INT', err => { if (err && err.errno !== 1060) console.error('speaker migration:', err); });
  db.query('ALTER TABLE movement ADD COLUMN production_id INT', err => { if (err && err.errno !== 1060) console.error('movement migration:', err); });

  db.query(`
    CREATE TABLE IF NOT EXISTS production (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     INT NOT NULL,
      production_name VARCHAR(255) NOT NULL,
      stage_image MEDIUMTEXT,
      script_body MEDIUMTEXT,
      FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    )
  `, err => { if (err) console.error('production create error:', err); });

  // errno 1060 = duplicate column, 1061 = duplicate key name
  db.query('ALTER TABLE speaker ADD COLUMN script_name VARCHAR(255)', err => { if (err && err.errno !== 1060) console.error('speaker script_name migration:', err); });
  db.query('ALTER TABLE speaker ADD UNIQUE KEY prod_initials (production_id, initials)', err => { if (err && err.errno !== 1061) console.error('speaker unique key migration:', err); });
  db.query('ALTER TABLE production ADD COLUMN user_id INT', err => { if (err && err.errno !== 1060) console.error('production user_id migration:', err); });
  db.query('ALTER TABLE production ADD COLUMN stage_image MEDIUMTEXT', err => { if (err && err.errno !== 1060) console.error('production stage_image migration:', err); });
  db.query('ALTER TABLE production ADD COLUMN script_body MEDIUMTEXT', err => { if (err && err.errno !== 1060) console.error('production script_body migration:', err); });
  db.query('ALTER TABLE movement ADD COLUMN para_index INT', err => { if (err && err.errno !== 1060) console.error('movement para_index migration:', err); });
  db.query('ALTER TABLE movement ADD COLUMN text_offset INT', err => { if (err && err.errno !== 1060) console.error('movement text_offset migration:', err); });
});

app.post('/api/saveScript', async (req, res) => {
  const { content } = req.body;
  const values = [req.body.content];
  const query = 'INSERT INTO script(content) VALUES(?)';
  db.query(query, values, (err, result) => {
		if(err) {
			console.log(err);
		}
		else {
			console.log ("script successfully saved.");
			res.send("Script successfully saved.");
		}
  });
});

app.get("/api/validate", verifyToken, (req, res) => {
  return res.status(200).json({ valid: 'true', first_name: req.user.first_name, last_name: req.user.last_name, email: req.user.email });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: true, // Should match original cookie settings
    sameSite: 'Strict'
  });
  res.status(200).json({ message: "Logged out successfully" });
});


app.post("/api/register", (req, res) => {
	console.log(req.body);
  var salt = bcrypt.genSaltSync(10);
  var hashedPassword = bcrypt.hashSync(req.body.password, salt);
  
  const query = 'INSERT INTO user(first_name, last_name, email, password) VALUES(?, ?, ?, ?)';
  const values = [req.body.firstname, req.body.lastname, req.body.email, hashedPassword];
  db.query(query, values, (err, result) => {
		if(err) {
			console.log(err);
		}
		else {
			console.log ("user successfully registered.");
			res.send("User successfully registered.");
		}
  });
});

app.post("/api/login", (req, res)=> {
  console.log(req.body);
  db.query("SELECT * FROM user WHERE email = '" + req.body.email + "'", (err, result) => {
    if (err){
      console.log(err);
    }
    else{
      if(result.length > 0) {
        if(bcrypt.compareSync(req.body.password, result[0].password)){
          var token = jwt.sign({ id: result[0].id, first_name: result[0].first_name, last_name: result[0].last_name, email: result[0].email}, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h'});
          res.cookie('token', token, {
              httpOnly: true,
              secure: true, // Only send over HTTPS
              sameSite: 'Strict',
              maxAge: 3600000 // 1 hour
          }).send({ message: "Logged in successfully" });
        }
        else{
          res.send("Incorrect credentials");
        }
      }
      else{
        res.send("Incorrect credentials.");
      }
    }
    }
  )
});

app.post('/api/users', (req, res) => {
  const { name, email } = req.body;
  const sql = 'INSERT INTO user (name, email) VALUES (?, ?)';

  db.query(sql, [name, email], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({
      id: result.insertId,
      name,
      email
    });
  });
});
app.get('/api/users', verifyToken, (req, res) => {
  db.query('SELECT * FROM user ORDER BY id DESC', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});



app.get('/api/users/:id', (req, res) => {
  const { id } = req.params;

  db.query('SELECT * FROM user WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(results[0]);
  });
});

app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;

  const sql = 'UPDATE user SET name = ?, email = ? WHERE id = ?';

  db.query(sql, [name, email, id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User updated successfully' });
  });
});

app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;

  db.query('DELETE FROM user WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  });
});

// ---------------------------------------------------------------------------
// Speakers
// ---------------------------------------------------------------------------

/**
 * GET /api/speakers
 * Returns all speakers for the production, ordered by id.
 * Protected: requires a valid session cookie.
 */
app.get('/api/speakers', verifyToken, (req, res) => {
    const { productionId } = req.query;
    if (!productionId) return res.status(400).json({ error: 'productionId is required.' });
    db.query(
        'SELECT id, script_name, first_name, last_name, initials, color, rp_x, rp_y FROM speaker WHERE production_id = ? ORDER BY id ASC',
        [productionId],
        (err, results) => {
            if (err) {
                console.error('GET /api/speakers error:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json(results);
        }
    );
});

/**
 * PUT /api/speakers
 * Upserts the stage position (rp_x, rp_y) for every speaker in the payload.
 * Body: [{ id, initials, rpX, rpY }, …]
 * Uses INSERT … ON DUPLICATE KEY UPDATE so new rows are inserted and existing
 * rows have their RP updated in a single round-trip.
 * Protected: requires a valid session cookie.
 */
app.put('/api/speakers', verifyToken, (req, res) => {
    const speakers = req.body;

    if (!Array.isArray(speakers) || speakers.length === 0) {
        return res.status(400).json({ error: 'Request body must be a non-empty array of speakers.' });
    }

    // Build a multi-row VALUES list: (id, name, initials, color, rp_x, rp_y)
    // We only have id + rpX/rpY from the client, so we use a subquery to preserve
    // the existing name/initials/color columns via ON DUPLICATE KEY UPDATE.
    const values = speakers.map(s => [
        s.id,
        s.rpX != null ? s.rpX : null,
        s.rpY != null ? s.rpY : null,
    ]);

    // One UPDATE per speaker, issued in parallel via a simple loop.
    // All speakers share the same connection so ordering is preserved.
    let completed = 0;
    let failed    = false;

    speakers.forEach((s, i) => {
        if (s.id == null) {
            // Speaker was loaded from the fallback list and has no DB id yet — skip.
            completed += 1;
            if (completed === speakers.length && !failed) res.json({ updated: completed });
            return;
        }

        db.query(
            'UPDATE speaker SET rp_x = ?, rp_y = ? WHERE id = ?',
            [s.rpX ?? null, s.rpY ?? null, s.id],
            (err) => {
                if (err && !failed) {
                    failed = true;
                    console.error('PUT /api/speakers error:', err);
                    return res.status(500).json({ error: err.message });
                }
                completed += 1;
                if (completed === speakers.length && !failed) {
                    res.json({ updated: completed });
                }
            }
        );
    });
});

// ---------------------------------------------------------------------------
// Movements
// ---------------------------------------------------------------------------

/**
 * POST /api/movements
 * Persists a completed character movement and its waypoints.
 * Uses a transaction so the movements row and all waypoint rows are written
 * atomically — a partial write on network error leaves no orphaned data.
 *
 * Body: {
 *   speakerId,  markerId,
 *   shadowRpX, shadowRpY,
 *   endRpX,    endRpY,
 *   waypoints: [{ sequence, rpX, rpY }, …]
 * }
 * Protected: requires a valid session cookie.
 */
app.post('/api/movements', verifyToken, async (req, res) => {
    const { speakerId, markerId, shadowRpX, shadowRpY, endRpX, endRpY, waypoints = [], speakerPositions = [], productionId, paraIndex, textOffset } = req.body;

    if (speakerId == null || markerId == null || productionId == null) {
        return res.status(400).json({ error: 'speakerId, markerId, and productionId are required.' });
    }

    // Use the promise-based wrapper so we can await inside an async route handler.
    const conn = db.promise();

    try {
        await conn.beginTransaction();

        const [movResult] = await conn.query(
            `INSERT INTO movement
                (speaker_id, marker_id, shadow_rp_x, shadow_rp_y, end_rp_x, end_rp_y, production_id, para_index, text_offset)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [speakerId, markerId, shadowRpX ?? null, shadowRpY ?? null, endRpX ?? null, endRpY ?? null, productionId, paraIndex ?? null, textOffset ?? null]
        );

        const movementId = movResult.insertId;

        if (waypoints.length > 0) {
            const waypointRows = waypoints.map(wp => [
                movementId,
                wp.sequence,
                wp.rpX ?? null,
                wp.rpY ?? null,
            ]);
            await conn.query(
                'INSERT INTO waypoint (movement_id, sequence, rp_x, rp_y) VALUES ?',
                [waypointRows]
            );
        }

        if (speakerPositions.length > 0) {
            const posRows = speakerPositions.map(sp => [movementId, sp.speakerId, sp.rX, sp.rY]);
            await conn.query(
                'INSERT INTO movement_speaker_position (movement_id, speaker_id, rp_x, rp_y) VALUES ?',
                [posRows]
            );
        }

        await conn.commit();
        console.log(`Movement ${movementId} saved (${waypoints.length} waypoints).`);
        res.status(201).json({ id: movementId });

    } catch (err) {
        await conn.rollback();
        console.error('POST /api/movements error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/movements
 * Returns all movements with their speaker-position snapshots, grouped by marker_id.
 * Protected: requires a valid session cookie.
 */
app.get('/api/movements', verifyToken, async (req, res) => {
    const { productionId } = req.query;
    if (!productionId) return res.status(400).json({ error: 'productionId is required.' });
    const conn = db.promise();
    try {
        const [rows] = await conn.query(`
            SELECT m.id, m.marker_id, m.para_index, m.text_offset,
                   m.shadow_rp_x, m.shadow_rp_y, m.end_rp_x, m.end_rp_y,
                   sp_mover.initials AS mover_initials,
                   sp.initials, msp.rp_x, msp.rp_y
            FROM movement m
            JOIN movement_speaker_position msp ON m.id = msp.movement_id
            JOIN speaker sp ON msp.speaker_id = sp.id
            JOIN speaker sp_mover ON m.speaker_id = sp_mover.id
            WHERE m.production_id = ?
            ORDER BY m.marker_id, sp.initials
        `, [productionId]);

        const map = {};
        rows.forEach(row => {
            if (!map[row.marker_id]) {
                map[row.marker_id] = {
                    id:           row.id,
                    paraIndex:    row.para_index,
                    textOffset:   row.text_offset,
                    moverInitials: row.mover_initials,
                    shadowRpX:    row.shadow_rp_x != null ? parseFloat(row.shadow_rp_x) : null,
                    shadowRpY:    row.shadow_rp_y != null ? parseFloat(row.shadow_rp_y) : null,
                    endRpX:       row.end_rp_x   != null ? parseFloat(row.end_rp_x)   : null,
                    endRpY:       row.end_rp_y   != null ? parseFloat(row.end_rp_y)   : null,
                    positions:    [],
                };
            }
            map[row.marker_id].positions.push({
                initials: row.initials,
                rX:       parseFloat(row.rp_x),
                rY:       parseFloat(row.rp_y),
            });
        });

        // Fetch waypoints for all movements in this production
        const movementIds = Object.values(map).map(m => m.id);
        const waypointMap = {};
        if (movementIds.length > 0) {
            const [wRows] = await conn.query(
                'SELECT movement_id, sequence, rp_x, rp_y FROM waypoint WHERE movement_id IN (?) ORDER BY movement_id, sequence',
                [movementIds]
            );
            wRows.forEach(w => {
                if (!waypointMap[w.movement_id]) waypointMap[w.movement_id] = [];
                waypointMap[w.movement_id].push({ sequence: w.sequence, rX: parseFloat(w.rp_x), rY: parseFloat(w.rp_y) });
            });
        }

        const result = Object.entries(map).map(([markerId, data]) => ({
            markerId:         parseInt(markerId),
            id:               data.id,
            paraIndex:        data.paraIndex,
            textOffset:       data.textOffset,
            moverInitials:    data.moverInitials,
            shadowRpX:        data.shadowRpX,
            shadowRpY:        data.shadowRpY,
            endRpX:           data.endRpX,
            endRpY:           data.endRpY,
            waypoints:        waypointMap[data.id] || [],
            speakerPositions: data.positions,
        }));

        res.json(result);
    } catch (err) {
        console.error('GET /api/movements error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/movements/:id
 * Updates a movement's shadow, end, waypoints, and/or speaker-position snapshot.
 * Accepts any combination; only supplied fields are modified.
 */
app.put('/api/movements/:id', verifyToken, async (req, res) => {
    const movementId = req.params.id;
    const { shadowRpX, shadowRpY, endRpX, endRpY, waypoints, speakerPositions } = req.body;
    const conn = db.promise();
    try {
        await conn.beginTransaction();

        const setClauses = [];
        const params     = [];
        if (shadowRpX !== undefined) { setClauses.push('shadow_rp_x = ?'); params.push(shadowRpX); }
        if (shadowRpY !== undefined) { setClauses.push('shadow_rp_y = ?'); params.push(shadowRpY); }
        if (endRpX    !== undefined) { setClauses.push('end_rp_x = ?');    params.push(endRpX); }
        if (endRpY    !== undefined) { setClauses.push('end_rp_y = ?');    params.push(endRpY); }
        if (setClauses.length > 0) {
            params.push(movementId);
            await conn.query(`UPDATE movement SET ${setClauses.join(', ')} WHERE id = ?`, params);
        }

        if (waypoints !== undefined) {
            await conn.query('DELETE FROM waypoint WHERE movement_id = ?', [movementId]);
            if (waypoints.length > 0) {
                const rows = waypoints.map(wp => [movementId, wp.sequence, wp.rX, wp.rY]);
                await conn.query('INSERT INTO waypoint (movement_id, sequence, rp_x, rp_y) VALUES ?', [rows]);
            }
        }

        if (speakerPositions !== undefined) {
            await conn.query('DELETE FROM movement_speaker_position WHERE movement_id = ?', [movementId]);
            if (speakerPositions.length > 0) {
                const rows = speakerPositions.map(sp => [movementId, sp.speakerId, sp.rX, sp.rY]);
                await conn.query('INSERT INTO movement_speaker_position (movement_id, speaker_id, rp_x, rp_y) VALUES ?', [rows]);
            }
        }

        await conn.commit();
        res.json({ ok: true });
    } catch (err) {
        await conn.rollback();
        console.error('PUT /api/movements/:id error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// Productions
// ---------------------------------------------------------------------------

app.get('/api/productions', verifyToken, (req, res) => {
    db.query('SELECT id, production_name AS name FROM production WHERE user_id = ? ORDER BY id ASC', [req.user.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post('/api/productions', verifyToken, (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    db.query('INSERT INTO production (user_id, production_name) VALUES (?, ?)', [req.user.id, name], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: result.insertId, name });
    });
});

app.get('/api/productions/:id', verifyToken, (req, res) => {
    db.query(
        'SELECT id, production_name AS name, stage_image, script_body FROM production WHERE id = ? AND user_id = ?',
        [req.params.id, req.user.id],
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!results.length) return res.status(404).json({ error: 'Not found.' });
            res.json(results[0]);
        }
    );
});

app.put('/api/productions/:id', verifyToken, (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    db.query(
        'UPDATE production SET production_name = ? WHERE id = ? AND user_id = ?',
        [name, req.params.id, req.user.id],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!result.affectedRows) return res.status(404).json({ error: 'Not found.' });
            res.json({ ok: true });
        }
    );
});

app.delete('/api/productions/:id', verifyToken, async (req, res) => {
    const productionId = req.params.id;
    const conn = db.promise();
    try {
        await conn.beginTransaction();

        // Verify ownership before deleting anything
        const [[prod]] = await conn.query(
            'SELECT id FROM production WHERE id = ? AND user_id = ?',
            [productionId, req.user.id]
        );
        if (!prod) {
            await conn.rollback();
            return res.status(404).json({ error: 'Not found.' });
        }

        // Delete child rows that reference this production (deepest dependents first)
        await conn.query('DELETE FROM waypoint WHERE movement_id IN (SELECT id FROM movement WHERE production_id = ?)', [productionId]);
        await conn.query('DELETE FROM movement             WHERE production_id = ?', [productionId]);
        await conn.query('DELETE FROM speaker              WHERE production_id = ?', [productionId]);
        await conn.query('DELETE FROM production_user_role WHERE production_id = ?', [productionId]).catch(() => {});

        await conn.query('DELETE FROM production WHERE id = ?', [productionId]);

        await conn.commit();
        res.json({ ok: true });
    } catch (err) {
        await conn.rollback();
        console.error('DELETE /api/productions error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/productions/:id/image', verifyToken, (req, res) => {
    const { image } = req.body;
    db.query(
        'UPDATE production SET stage_image = ? WHERE id = ? AND user_id = ?',
        [image, req.params.id, req.user.id],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!result.affectedRows) return res.status(404).json({ error: 'Not found.' });
            res.json({ ok: true });
        }
    );
});

app.put('/api/productions/:id/script', verifyToken, (req, res) => {
    const { scriptBody } = req.body;
    db.query(
        'UPDATE production SET script_body = ? WHERE id = ? AND user_id = ?',
        [scriptBody, req.params.id, req.user.id],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!result.affectedRows) return res.status(404).json({ error: 'Not found.' });
            res.json({ ok: true });
        }
    );
});

app.post('/api/productions/:id/speakers', verifyToken, async (req, res) => {
    const productionId = req.params.id;
    const speakers = req.body;
    if (!Array.isArray(speakers)) return res.status(400).json({ error: 'Body must be an array.' });

    const conn = db.promise();
    try {
        await conn.beginTransaction();
        for (const s of speakers) {
            await conn.query(`
                INSERT INTO speaker (production_id, script_name, first_name, last_name, initials, color)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    script_name = VALUES(script_name),
                    first_name  = VALUES(first_name),
                    last_name   = VALUES(last_name),
                    color       = VALUES(color)
            `, [productionId, s.scriptName || null, s.firstName || null, s.lastName || null, s.initials || null, s.color || null]);
        }
        await conn.commit();
        res.json({ ok: true });
    } catch (err) {
        await conn.rollback();
        console.error('POST /api/productions/:id/speakers error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log('PORT: ' + PORT);
});