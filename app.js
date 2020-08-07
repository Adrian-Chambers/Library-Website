//jshint esversion:6

const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const _ = require("lodash");
const app = express();
const mongoose = require("mongoose");
const fs = require("fs");
const date = new Date();

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));
mongoose.connect("mongodb://localhost:27017/libraryDB", { useNewUrlParser: true , useUnifiedTopology: true } );


/* database */ 
const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    firstName: String,
    lastName: String,
    role: String,
});
const User = mongoose.model("User", userSchema);
User.count(function(err, count){
    if(!err && count === 0){
        const librarian = new User({
            username: "librarian",
            password: "pass",
            firstName: "librarian",
            lastName: "librarian",
            role: "librarian",
        });
        librarian.save();
        const admin = new User({
            username: "admin",
            password: "adminpass",
            firstName: "admin",
            lastName: "admin",
            role: "admin",
        });
        admin.save();
    }
})

const bookSchema = new mongoose.Schema({
    title: String,
    author: String,
    isbn: String,
    isReturned: Boolean,
    queue: []
});
const Book = mongoose.model("Book", bookSchema);
Book.count(function(err, count){
    if(!err && count === 0){
        var titles = readLines("textbook_titles.txt");
        var isbns = readLines("textbook_isbns.txt");
        var firstNames = readLines("First Names.txt");
        var lastNames = readLines("Last Names.txt");

        function readLines(path){
            const data = fs.readFileSync(path, "UTF-8");
            const lines = data.split(/\r?\n/);
            
            var arr = [];
            lines.forEach((line) => {
                arr.push(line);
            });
            return arr;
        }
        
        for(var i = 0; i < titles.length; i++){
            const book = new Book({ title: titles[i], isbn: isbns[i], author: firstNames[Math.floor(Math.random() * firstNames.length)] + " " + lastNames[Math.floor(Math.random() * lastNames.length)], isReturned: true, queue: []})
            book.save();
        }
    }
});

const transactionSchema = new mongoose.Schema({
    book: bookSchema,
    user: userSchema,
    username: String,
    borrowDate: String,
    returnDate: String,
    isReturned: Boolean
});
const Transaction = mongoose.model("Transaction", transactionSchema);


/* session */
let currentUser;

/* Index */
app.get("/", function(req, res){
    if(currentUser == null){
        res.redirect("sign-in");
    }
    res.render("home", {role: currentUser.role});
});

/* Sign In */
app.get("/sign-in", function(req, res){
    res.render("sign-in", {error: ""});
});

app.post("/sign-in", function(req, res){
    const reqUsername = req.body.username;
    const reqPassword = req.body.password;

    User.findOne({username: reqUsername, password: reqPassword}, function(err, user){
        if(user){
            currentUser = user;
            res.redirect("/");
        } else{
            res.render("sign-in", {error: "Invalid username/password"});
        }
    });
});

app.get("/sign-out", function(req, res){
    currentUser = null;
    res.redirect("/sign-in")
});

/* Register */
app.get("/register", function(req, res){
    res.render("register", {error: ""});
});

app.post("/register", function(req, res){
    User.findOne({username: req.body.username}, function(err, user){
        if(user){
            res.render("register", {error: "Username already taken"});
        }
        else{
            const newUser = new User({
                username: req.body.username,
                password: req.body.password,
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                role: "patron"
            });
            newUser.save();
            res.redirect("/sign-in");
        }
    });
});

/* Search */
app.get("/search?:keyword", function(req, res){
    const keyword = req.query.keyword; 
    Book.find({$or: [{title: keyword}, {author: keyword}, {isbn: keyword}]}, function(err, books){
        if(books) {
            res.render("search", { 
                results: books, 
                keyword: keyword,
                role: currentUser.role
            });
        }
    });
});

app.post("/search", function(req, res){
    res.redirect("/search?keyword=" + req.body.keyword);
});

/* View Book */
app.get("/book-info?:bookId", function (req, res){
    if(currentUser.role === "librarian") res.redirect("/book-edit?bookId=" + req.query.bookId);
    Book.findOne({_id: req.query.bookId}, function(err, book){
        if(book){
            res.render("book-info", {book: book, role: currentUser.role });
        } else{
            res.redirect("/");
        }
    })
});

app.post("/borrow?:bookId", function(req, res){
    Book.findOne({_id: req.query.bookId}, function(err, book){
        if(book.isReturned === true){
            book.isReturned = false;
            var transaction = new Transaction({
                book: book,
                user: currentUser,
                username: currentUser.username,
                borrowDate: date.getMonth() + "-" + date.getDate() + "-" + date.getFullYear(),
                isReturned: false
            });
            book.save(),
            transaction.save();
            confirm(res, "Borrowing Book", "You are now borrowing the book.", "/");
        } else {
            book.queue.push(currentUser._id);
            book.save(),
            confirm(res,  "Added to queue.", "This book is currently being borrowed by another patron. You have been added to the queue.", "/");
        }
    });
})

/* Edit Book */
app.get("/book-edit?:bookId", function(req, res){
    Book.findOne({_id: req.query.bookId}, function(err, book){
        res.render("book-edit", {book: book});
    });
});

app.post("/book-edit?:bookId", function(req, res){
    Book.updateOne({_id: req.query.bookId}, {
        title: req.body.title,
        author: req.body.author,
        isbn: req.body.isbn
    }, function(err, res){

    });

    confirm(res, "Book Edited", "Your book has been edited", "/");
});

app.post("/book-delete?:bookId", function(req, res){
    Book.deleteOne({_id: req.query.bookId}, function(err, book){
        if(err){
            console.log(err);
        } else{
            confirm(res, "Book Deleted", "The book has been successfully deleted.", "/");
        }
    });
});

/* Create book */
app.get("/book-create", function(req, res){
    res.render("book-create");
});

app.post("/book-create", function(req, res){
    var book = new Book({
        title: req.body.title,
        author: req.body.author,
        isbn: req.body.isbn,
        isReturned: true,
        queue: []
    });
    book.save();
    confirm(res, "Book Created", "Your book has been created", "/");
});

/* Account */
app.get("/account-info?:userId", function(req, res){
    if(!req.query.userId){
        res.redirect("/account-info?userId=" + currentUser._id);
    }
    User.findOne({_id: req.query.userId}, function(err, user){
        res.render("account-info", {
            user: user,
            error: "",
            role: currentUser.role
        });
    });
});

app.post("/account-update?:userId", function(req, res){
    User.findOne({_id: req.query.userId}, function(err, user){
        User.findOne({username: req.body.username}, function(err, user2){
            var reqRole = req.body.role;
            if(user2 && !(user2).equals(user)){
                res.render("account-info", {user: user, error: "Username already taken", role: currentUser.role });
            }
            else{
                if(reqRole){
                    user.role = reqRole;
                } else{
                    user.role = user.role;
                }
                user.firstName = req.body.firstName;
                user.lastName = req.body.lastName;
                user.username = req.body.username;
                user.password = req.body.password;
                    
                user.save();
                if(currentUser.equals(user)){
                    currentUser = user;
                    confirm(res, "Account Updated", "Your account information has been updated.", "/account-info");
                } else{
                    confirm(res, "Account Updated", "The account information has been updated.", "/users");
                }
            }
        });
    });
});

app.post("/account-delete?:userId", function(req, res){
    User.deleteOne({_id: req.query.userId}, function(err, u){
        if(err){
            console.log(err);
        } else{
            confirm(res, "User Deleted", "The account has been successfully deleted.", "/users");
        }
    });
});

app.get("/account-create", function(req, res){
    res.render("account-create", {error: ""});
});

app.post("/account-create", function(req, res){
    User.findOne({username: req.body.username}, function(err, user){
        if(user){
            res.render("account-create", {error: "Username already taken"});
        } else{
            var reqRole = req.body.role;
            if(reqRole === "patron" || reqRole === "librarian" || reqRole === "admin"){
                const user = new User({
                    username: req.body.username,
                    password: req.body.password,
                    firstName: req.body.firstName,
                    lastName: req.body.lastName,
                    role: req.body.role
                });
                user.save();
                confirm(res, "Account created", "The account has been created", "/");
            } else{
                res.render("account-create", {error: "Invalid Role. Must be a patron, librarian, or admin"});
            }            
        }
    })
})

/* Transactions */
app.get("/transactions", function(req, res){
    if(currentUser.role == "patron") res.redirect("/transaction-history");
    Transaction.find(function(err, transactions){
        res.render("transactions", {results: transactions});
    });
});

app.post("/transactions", function(req, res){
    
    Transaction.find({username: req.body.keyword}, function(err2, transactions){
        res.render("transactions", {results: transactions});
    });
});

app.get("/transaction-history", function(req, res){
    Transaction.find({user: currentUser}, function(err, transactions){
        res.render("transaction-history", {results: transactions});
    })
});

app.post("/return-book?:transactionId", function(req, res){
    Transaction.findOne({_id: req.query.transactionId}, function(err, transaction){
        transaction.isReturned = true;
        transaction.returnDate = date.getMonth() + "-" + date.getDate() + "-" + date.getFullYear();

        var book = new Book(transaction.book);
        console.log(book);
        if(book){
            if(book.queue === null || book.queue.length === 0){
                book.isReturned = true;
            } else{
                book.queue.shift();
            }
        }
        transaction.save();
        book.save();
    });
    
    confirm(res, "Book Returned", "The book has been returned.",  "/transactions");
});

/* Users */
app.get("/users", function(req, res){
    User.find(function(err, user){
        res.render("users", {results: user, role: currentUser.role});
    });
});

app.post("/users", function(req, res){
    const keyword = req.body.keyword;
    User.find({username: keyword}, function(err, user){
        res.render("users", {results: user, role: currentUser.role});
    });
});

function confirm(res, title, message, link){
    res.render("confirm",{
        title: title,
        message: message,
        link: link,
        role: currentUser.role
    });
};


app.listen(3000, function() {
    console.log("Server has started successfully");
});