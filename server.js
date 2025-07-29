require("dotenv").config();

//Connceting Node.js backend to CLoudinary
const cloudinary=require("cloudinary").v2;

cloudinary.config({
    cloud_name:"dzzjsl8si",
    api_key:"537964696873869",
    api_secret:"1z5YO1BSvUUDcjUYEZJpx87-PMg"
});

// Load Multer so we can handle file uploads
const multer = require("multer");

// Set Multer to keep uploaded files in memory instead of saving them to disk
const upload= multer({storage: multer.memoryStorage()});




// 🔌 Import required packages/modules
const express = require("express");        // To create the backend server
const nodemailer = require("nodemailer");  // To send emails from Node.js
const cors = require("cors");              // To allow frontend (browser) to connect
const bodyParser = require("body-parser"); // To read JSON data sent from frontend
const fs = require("fs");                  // To read and write user data into files
const bcrypt = require("bcrypt");          // For hash password


// 🚀 Create the Express app
const app = express();

// 🌐 Allow frontend to make requests to the server
app.use(cors());

// 🧠 Let the server read JSON data from the body of requests
app.use(bodyParser.json());

// 🗃️ Variables to store data temporarily in memory
let verificationCode = "";         // Store the 6-digit code sent to user
let registeredUserName = "";       // Store the name user typed
let registeredUserEmail = "";      // Store the email user typed
let registeredUserPassword = "";   //Store the password

// 🔢 Function to generate a 6-digit random number as string
function genCode() {
    return Math.floor(100000 + Math.random() * 900000).toString(); 
}

// ✉️ Route: When user submits name + email (to get verification code)
app.post("/send-code", (req, res) => {
    const { email, name, password } = req.body;

    // ✅ Step 1: Only allow Truman email
    if (!email.endsWith("@truman.edu")) {
        return res.json({ success: false, message: "Only Truman email allowed." });
    }

    // ✅ Step 2: Generate verification code and store basic info
    if (!verificationCode || registeredUserEmail !== email) {
    verificationCode = genCode();
    console.log("Generated code:", verificationCode);
    }

    registeredUserName = name;
    registeredUserEmail = email;

    // ✅ Step 3: Hash password
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            console.error("Error hashing password:", err);
            return res.json({ success: false, message: "Password hashing failed." });
        }

        registeredUserPassword = hash; // Store hashed password

        // ✅ Step 4: Set up email transporter
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
        }

        });

        // ✅ Step 5: Compose the email
        const mailOptions = {
            from: "trufind63501@gmail.com",
            to: email,
            subject: "Your TruFind Verification Code",
            text: `Your verification code is: ${verificationCode}`
        };

        // ✅ Step 6: Send the email
        transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
                console.error("Email error:", err);
                return res.json({ success: false, message: "Email sending failed." });
            }
            return res.json({ success: true });
        });
    });
});



//Inserting user info into MySQL
app.post("/verify-code", (req, res)=>{
    const {code}= req.body;

    console.log("User entered code:", code);
console.log("Expected verification code:", verificationCode);
console.log("typeof entered code:", typeof code);
console.log("typeof stored code:", typeof verificationCode);


    console.log("User entered code:", code);
    console.log("Expected verification code:", verificationCode);


    if(code.trim()=== verificationCode){
        const sql= "INSERT INTO users (name, email, password) VALUES (?,?,?)";

        db.query(sql, [registeredUserName, registeredUserEmail, registeredUserPassword], (err, reuslt)=>{
            if(err){
                if(err.code=== 'ER_DUP_ENTRY'){
                    console.warn("User already regsitered:", registeredUserEmail);
                    return res.json({success: true});
                } else{
                    console.error("MySQL insert error:", err);
                    return res.json({ success: false, message: "Database error" });
                }
            }
            console.log("User registered in MySQL:", registeredUserEmail);
            return res.json({success: true});
        });
    } else {
        return res.json({success: false, message:"Invalid code"})
    }
});



// 🔐 Route: When user logs in using email + password
app.post("/login", (req,res)=>{
    const { email, password } = req.body;

    const sql= "SELECT* FROM users WHERE email=?";

    db.query(sql, [email], (err, result)=>{

        if (err){
            console.error("Login error: ", err);
            return res.json({success: false, message: "Server error"});
        }

        if (result.length>0){
            const user=result[0];
            
            bcrypt.compare(password, user.password, (err, isMatch)=>{
                if(err){
                    console.error("Error comparing passwords", err);
                    return res.json({success: false, message: "Login Failed"});
                }

                if (isMatch){
                    return res.json({success:true, name:user.name});
                } else{
                    return res.json({success: false, message: "Invalid credentials" });
                }
            });
        } else{
            return res.json({success: false, message:"Invalid credentials"})
        }
    });
});


// 🟢 Start the backend server
app.listen(3000, () => {
    console.log("🚀 Server running at http://localhost:3000");
});



//MySQL (Database for saving post data)
const mysql= require("mysql2");

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});


db.connect((err)=>{    //err variable is reserved for reporting problem
if(err){
    console.error("Connection error", err);
    return;
}else{
console.log("Connected");
}});


//// Route for creating a new post:
// - saves post text
// - uploads image to Cloudinary if provided
// - saves everything in MySQL

app.post("/posts", upload.single("file"), async(req,res)=>{
    try{
        const name=req.body.name;
        const text=req.body.text;
        const file=req.file;

        let imageUrl="No file was uploaded";

        if(file){
            cloudinary.uploader
            .upload_stream(
                {resource_type:"image"},
                (error,result)=>{
                    if(error){
                        console.error("Cloudinary error:", error);
                        return res.json({success: false, message: "Cloudinary upload failed"})
                    }else{
                        const sql="INSERT INTO posts (name, text, fileName) VALUES(?,?,?)";
                        db.query(sql, [name, text, result.secure_url],(err, resultDb)=>{
                            if(err){
                                console.error("MySql save error:",err);
                                return res.json({success: false, message:"MySQl save failed"});
                            }else{
                                console.log("Post saved with Cloudinary url!");
                                return res.json({success:true});
                            }
                        })
                    }
                }
            )
            .end(file.buffer);
        }

    else{
        const sql = "INSERT INTO posts (name, text, fileName) VALUES (?, ?, ?)";
        db.query(sql,[name, text, imageUrl],(err, resultDb)=>{
        if (err) {
          console.error("MySQL save error:", err);
          return res.json({ success: false, message: "MySQL save failed" });
        } else {
          console.log("Post saved without image!");
          return res.json({ success: true });
        }
        }
        );
        }
    }
    catch(error){
        console.error("Server error:", error);
    res.json({ success: false, message: "Server error" });
    }
});


//This code ask for info for a specific user from MYSQL database:

app.get("/posts/:name",(req,res)=>{
    const name= req.params.name;  //Grabs the name from the url if  url is /posts/Ashraful then name="Ashraful")
    const sql= "SELECT* FROM posts WHERE name=? ORDER BY time DESc ";

    db.query(sql,[name],(err,result)=>{
        if(err){
            console.error("Error fetching posts:", err);
            return res.json({success:false});
        }
        res.json({success: true, posts: result});
    });
});


//Getting all posts from MySQL

app.get("/all-posts", (req, res)=>{
    const sql="SELECT * FROM posts ORDER BY time DESC";

    db.query(sql,(err, result)=>{
        if(err){
            console.error("Error fetching posts", err);
            return res.json({success: false});
        }
        return res.json({success:true, posts: result});
    });
});


//File delete Route for backend
app.delete("/delete-posts/:id", (req,res)=>{
    const postId=req.params.id;
    const userName=req.query.name;

    const sql="DELETE FROM posts WHERE id = ? AND name=?";

    db.query(sql, [postId, userName],(err, result)=>{
        if(err){
            console.error("Error deleting post:", err);
            return res.json({success: false,message: "Delete failed"});
        }
        if(result.affectedRows>0){
            return res.json({success: true, message: "Post deleted"});
        } else{
            return res.json({success: false, message: "No post found"});
        }
    }

    );
}

);