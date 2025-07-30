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
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
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

    if (!verificationCode || registeredUserEmail !== email) {
        verificationCode = genCode();
        console.log("Generated code:", verificationCode);
    }

    registeredUserName = name;
    registeredUserEmail = email;

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            console.error("Error hashing password:", err);
            return res.json({ success: false, message: "Password hashing failed." });
        }

        registeredUserPassword = hash;

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
            text: `Your verification code is: ${verificationCode}`
        };

        transporter.sendMail(mailOptions, (err) => {
            if (err) {
                console.error("Email error:", err);
                return res.json({ success: false, message: "Email sending failed." });
            }
            return res.json({ success: true });
        });
    });
});

// ✅ Verify Code and Register User
app.post("/verify-code", (req, res) => {
    const { code } = req.body;

    if (code.trim() === verificationCode) {
        const sql = "INSERT INTO users (name, email, password) VALUES ($1, $2, $3)";
        pool.query(sql, [registeredUserName, registeredUserEmail, registeredUserPassword], (err) => {
            if (err) {
                if (err.code === '23505') {
                    console.warn("User already registered:", registeredUserEmail);
                    return res.json({ success: true });
                } else {
                    console.error("PostgreSQL insert error:", err);
                    return res.json({ success: false, message: "Database error" });
                }
            }
            console.log("User registered in PostgreSQL:", registeredUserEmail);
            return res.json({ success: true });
        });
    } else {
        return res.json({ success: false, message: "Invalid code" });
    }
});

// ✅ Login Endpoint
app.post("/login", (req, res) => {
    const { email, password } = req.body;
    const sql = "SELECT * FROM users WHERE email=$1";
    pool.query(sql, [email], (err, result) => {
        if (err) {
            console.error("Login error:", err);
            return res.json({ success: false, message: "Server error" });
        }
        if (result.rows.length > 0) {
            const user = result.rows[0];
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) {
                    console.error("Error comparing passwords", err);
                    return res.json({ success: false, message: "Login Failed" });
                }
                if (isMatch) {
                    return res.json({ success: true, name: user.name });
                } else {
                    return res.json({ success: false, message: "Invalid credentials" });
                }
            });
        } else {
            return res.json({ success: false, message: "Invalid credentials" });
        }
    });
});

// ✅ Create New Post with Optional Image
app.post("/posts", upload.single("file"), async (req, res) => {
    try {
        const name = req.body.name;
        const text = req.body.text;
        const file = req.file;

        let imageUrl = "No file was uploaded";

        if (file) {
            cloudinary.uploader.upload_stream({ resource_type: "image" }, (error, result) => {
                if (error) {
                    console.error("Cloudinary error:", error);
                    return res.json({ success: false, message: "Cloudinary upload failed" });
                } else {
                    const sql = "INSERT INTO posts (name, text, fileName) VALUES ($1, $2, $3)";
                    pool.query(sql, [name, text, result.secure_url], (err) => {
                        if (err) {
                            console.error("PostgreSQL save error:", err);
                            return res.json({ success: false, message: "PostgreSQL save failed" });
                        } else {
                            console.log("Post saved with Cloudinary url!");
                            return res.json({ success: true });
                        }
                    });
                }
            }).end(file.buffer);
        } else {
            const sql = "INSERT INTO posts (name, text, fileName) VALUES ($1, $2, $3)";
            pool.query(sql, [name, text, imageUrl], (err) => {
                if (err) {
                    console.error("PostgreSQL save error:", err);
                    return res.json({ success: false, message: "PostgreSQL save failed" });
                } else {
                    console.log("Post saved without image!");
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
app.listen(3000, () => {
    console.log("🚀 Server running at http://localhost:3000");
});
