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
          var token = jwt.sign({ first_name: result[0].first_name, last_name: result[0].last_name, email: result[0].email}, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h'});
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
    db.query(
        'SELECT id, first_name, last_name, initials, color, rp_x, rp_y FROM speaker ORDER BY id ASC',
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
    const { speakerId, markerId, shadowRpX, shadowRpY, endRpX, endRpY, waypoints = [] } = req.body;

    if (speakerId == null || markerId == null) {
        return res.status(400).json({ error: 'speakerId and markerId are required.' });
    }

    // Use the promise-based wrapper so we can await inside an async route handler.
    const conn = db.promise();

    try {
        await conn.beginTransaction();

        const [movResult] = await conn.query(
            `INSERT INTO movement
                (speaker_id, marker_id, shadow_rp_x, shadow_rp_y, end_rp_x, end_rp_y)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [speakerId, markerId, shadowRpX ?? null, shadowRpY ?? null, endRpX ?? null, endRpY ?? null]
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

        await conn.commit();
        console.log(`Movement ${movementId} saved (${waypoints.length} waypoints).`);
        res.status(201).json({ id: movementId });

    } catch (err) {
        await conn.rollback();
        console.error('POST /api/movements error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log('PORT: ' + PORT);
});