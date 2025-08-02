// ✅ Load Environment Variables
require("dotenv").config();

// ✅ Cloudinary Setup
const cloudinary = require("cloudinary").v2;
cloudinary.config({
    cloud_name: "dzzjsl8si",
    api_key: "537964696873869",
    api_secret: "1z5YO1BSvUUDcjUYEZJpx87-PMg"
});

// ✅ Multer Setup for File Uploads
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Import Required Packages
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");

// ✅ Initialize Express App
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Setup PostgreSQL Connection
const pool = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false }
});


// ✅ Temporary Storage for Verification Process
let verificationCode = "";
let registeredUserName = "";
let registeredUserEmail = "";
let registeredUserPassword = "";

function genCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ✅ Send Verification Code via Email
app.post("/send-code", (req, res) => {
    const { email, name, password } = req.body;

    if (!email.endsWith("@truman.edu")) {
        return res.json({ success: false, message: "Only Truman email allowed." });
    }

    const code = genCode(); // always generate new code

    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) return res.json({ success: false, message: "Password error" });

        const sql = `
            INSERT INTO users (name, email, password, verification_code)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (email) DO UPDATE
            SET name = EXCLUDED.name, password = EXCLUDED.password, verification_code = EXCLUDED.verification_code
        `;
        pool.query(sql, [name, email, hashedPassword, code], (err) => {
            if (err) {
                console.error("DB error:", err);
                return res.json({ success: false, message: "Database error" });
            }

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


// ✅ Verify Code and Register User
app.post("/verify-code", (req, res) => {
    const { email, code } = req.body;

    const sql = "SELECT * FROM users WHERE email=$1 AND verification_code=$2";
    pool.query(sql, [email, code], (err, result) => {
        if (err || result.rows.length === 0) {
            return res.json({ success: false, message: "Invalid code or email" });
        }

        const updateSQL = `
            UPDATE users SET is_verified = true, verification_code = NULL
            WHERE email = $1
        `;
        pool.query(updateSQL, [email], (err) => {
            if (err) {
                console.error("DB update error:", err);
                return res.json({ success: false, message: "Failed to verify" });
            }
            return res.json({ success: true });
        });
    });
});


// ✅ Login Endpoint
app.post("/posts", upload.single("file"), async (req, res) => {
    try {
        const name = req.body.name;
        const text = req.body.text;
        const file = req.file;

        if (file) {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream({ resource_type: "image" }, (error, result) => {
                    if (error) {
                        console.error("Cloudinary error:", error);
                        reject("Cloudinary upload failed");
                    } else {
                        resolve(result);
                    }
                }).end(file.buffer);
            });

            const sql = "INSERT INTO posts (name, text, fileName) VALUES ($1, $2, $3)";
            pool.query(sql, [name, text, result.secure_url], (err) => {
                if (err) {
                    console.error("PostgreSQL save error:", err);
                    return res.json({ success: false, message: "PostgreSQL save failed" });
                } else {
                    console.log("Post saved with Cloudinary URL");
                    return res.json({ success: true });
                }
            });
        } else {
            const sql = "INSERT INTO posts (name, text, fileName) VALUES ($1, $2, $3)";
            pool.query(sql, [name, text, "No file was uploaded"], (err) => {
                if (err) {
                    console.error("PostgreSQL save error:", err);
                    return res.json({ success: false, message: "PostgreSQL save failed" });
                } else {
                    console.log("Post saved without image");
                    return res.json({ success: true });
                }
            });
        }
    } catch (error) {
        console.error("Server error:", error);
        res.json({ success: false, message: "Server error" });
    }
});


// ✅ Fetch Posts by Username
app.get("/posts/:name", (req, res) => {
    const name = req.params.name;
    const sql = "SELECT * FROM posts WHERE name=$1 ORDER BY time DESC";
    pool.query(sql, [name], (err, result) => {
        if (err) {
            console.error("Error fetching posts:", err);
            return res.json({ success: false });
        }
        res.json({ success: true, posts: result.rows });
    });
});

// ✅ Fetch All Posts
app.get("/all-posts", (req, res) => {
    const sql = "SELECT * FROM posts ORDER BY time DESC";
    pool.query(sql, (err, result) => {
        if (err) {
            console.error("Error fetching posts", err);
            return res.json({ success: false });
        }
        return res.json({ success: true, posts: result.rows });
    });
});

// ✅ Delete Post by ID and Username
app.delete("/delete-posts/:id", (req, res) => {
    const postId = req.params.id;
    const userName = req.query.name;
    const sql = "DELETE FROM posts WHERE id = $1 AND name = $2";
    pool.query(sql, [postId, userName], (err, result) => {
        if (err) {
            console.error("Error deleting post:", err);
            return res.json({ success: false, message: "Delete failed" });
        }
        if (result.rowCount > 0) {
            return res.json({ success: true, message: "Post deleted" });
        } else {
            return res.json({ success: false, message: "No post found" });
        }
    });
});

// ✅ Start the Server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});



app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users");
    res.json({ success: true, rows: result.rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});
