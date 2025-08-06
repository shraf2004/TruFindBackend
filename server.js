// ✅✅✅ TruFind server.js — Backend
require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

// ✅ Setup Express
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Setup PostgreSQL
const pool = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false }
});

// ✅ Cloudinary Config
cloudinary.config({
    cloud_name: "dzzjsl8si",
    api_key: "537964696873869",
    api_secret: "1z5YO1BSvUUDcjUYEZJpx87-PMg"
});

// ✅ Multer Setup
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Generate 6-digit Code
function genCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ✅ Send Email Verification Code
app.post("/send-code", (req, res) => {
    const { email, name, password } = req.body;
    if (!email.endsWith("@truman.edu")) {
        return res.json({ success: false, message: "Only Truman email allowed." });
    }

    const code = genCode();
    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) return res.json({ success: false, message: "Password error" });

        const sql = `INSERT INTO users (name, email, password, verification_code)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (email) DO UPDATE
                     SET name = EXCLUDED.name, password = EXCLUDED.password, verification_code = EXCLUDED.verification_code`;

        pool.query(sql, [name, email, hashedPassword, code], (err) => {
            if (err) return res.json({ success: false, message: "Database error" });

            const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: process.env.GMAIL_USER,
                    pass: process.env.GMAIL_PASS
                }
            });

            const mailOptions = {
                from: process.env.GMAIL_USER,
                to: email,
                subject: "Your TruFind Verification Code",
                text: `Your verification code is: ${code}`
            };

            transporter.sendMail(mailOptions, (err) => {
                if (err) return res.json({ success: false, message: "Email error" });
                return res.json({ success: true });
            });
        });
    });
});

// ✅ Verify Code
app.post("/verify-code", (req, res) => {
    const { email, code } = req.body;
    const sql = "SELECT * FROM users WHERE email=$1 AND verification_code=$2";
    pool.query(sql, [email, code], (err, result) => {
        if (err || result.rows.length === 0) {
            return res.json({ success: false, message: "Invalid code or email" });
        }

        const updateSQL = `UPDATE users SET is_verified = true, verification_code = NULL WHERE email = $1`;
        pool.query(updateSQL, [email], (err) => {
            if (err) return res.json({ success: false, message: "Failed to verify" });
            return res.json({ success: true });
        });
    });
});

// ✅ Create Post
app.post("/posts", upload.single("image"), async (req, res) => {
    try {
        const userId = req.body.user_id;
        const title = req.body.title;
        const description = req.body.description;
        const file = req.file;

        let imageUrl = "No image";

        if (file) {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream({ resource_type: "image" }, (error, result) => {
                    if (error) reject("Cloudinary error");
                    else resolve(result);
                }).end(file.buffer);
            });
            imageUrl = result.secure_url;
        }

        const sql = `INSERT INTO posts (user_id, title, description, image_url, created_at)
                     VALUES ($1, $2, $3, $4, NOW())`;

        pool.query(sql, [userId, title, description, imageUrl], (err) => {
            if (err) return res.json({ success: false });
            return res.json({ success: true });
        });
    } catch (err) {
        return res.json({ success: false, message: "Server error" });
    }
});

// ✅ Get Posts by user_id
app.get("/posts/:user_id", (req, res) => {
    const userId = req.params.user_id;
    const sql = "SELECT * FROM posts WHERE user_id = $1 ORDER BY created_at DESC";
    pool.query(sql, [userId], (err, result) => {
        if (err) return res.json({ success: false });
        res.json({ success: true, posts: result.rows });
    });
});

// ✅ Get All Posts with user name
app.get("/all-posts", (req, res) => {
    const sql = `SELECT posts.*, users.name FROM posts JOIN users ON posts.user_id = users.id ORDER BY created_at DESC`;
    pool.query(sql, (err, result) => {
        if (err) return res.json({ success: false });
        return res.json({ success: true, posts: result.rows });
    });
});

// ✅ Delete Post
app.delete("/delete-posts/:id", (req, res) => {
    const postId = req.params.id;
    const userId = req.query.userId;
    const sql = "DELETE FROM posts WHERE id = $1 AND user_id = $2";
    pool.query(sql, [postId, userId], (err, result) => {
        if (err) return res.json({ success: false });
        if (result.rowCount > 0) return res.json({ success: true });
        else return res.json({ success: false });
    });
});

// ✅ Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});


// ✅ Login Route
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    // 1. Find the user with matching email and verified status
    const sql = "SELECT * FROM users WHERE email = $1 AND is_verified = true";
    pool.query(sql, [email], (err, result) => {
        if (err) {
            console.error("DB error during login:", err);
            return res.json({ success: false, message: "Database error" });
        }

        if (result.rows.length === 0) {
            return res.json({ success: false, message: "User not found or not verified" });
        }

        const user = result.rows[0];

        // 2. Compare password
        bcrypt.compare(password, user.password, (err, match) => {
            if (err || !match) {
                return res.json({ success: false, message: "Invalid password" });
            }

            // 3. Send user info back on successful login
            return res.json({ success: true, id: user.id, name: user.name });
        });
    });
});
