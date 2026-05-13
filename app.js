const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
const bodyParser = require("body-parser");
const PORT = 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({
  extended: true
}));


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

app.get("/", (req, res) => {
  db.query("select * from users", (err, result, field) => {
      if(err) {
        console.log(err);
      }
      else {
        res.send(result);
      }
  })
});

app.post("/register", (req, res) => {
	console.log(req.body);
	db.query("insert into users(username, email, password) values('"+req.body.username+"', '"+req.body.email+"', '"+req.body.password+"')", (err, result, field) => {
		if(err) {
			console.log(err);
		}
		else {
			console.log ("user successfully registered.");
			res.send("User successfully registered.");
		}
  });
});



app.post('/api/users', (req, res) => {
  const { name, email } = req.body;
  const sql = 'INSERT INTO users (name, email) VALUES (?, ?)';

  db.query(sql, [name, email], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({
      id: result.insertId,
      name,
      email
    });
  });
});
app.get('/api/users', (req, res) => {
  db.query('SELECT * FROM users ORDER BY id DESC', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});



app.get('/api/users/:id', (req, res) => {
  const { id } = req.params;

  db.query('SELECT * FROM users WHERE id = ?', [id], (err, results) => {
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

  const sql = 'UPDATE users SET name = ?, email = ? WHERE id = ?';

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

  db.query('DELETE FROM users WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log('PORT: ' + PORT);
});