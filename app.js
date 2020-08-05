//jshint esversion:6

const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const _ = require("lodash");
const app = express();
const mongoose = require("mongoose");
const fs = require("fs");

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
    isLibrarian: Boolean,
});
const User = mongoose.model("User", userSchema);
User.count(function(err, count){
    if(!err && count === 0){
        const librarian = new User({
            username: "librarian",
            password: "pass",
            firstName: "librarian",
            lastName: "librarian",
            isLibrarian: true,
        });
        librarian.save();
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
    else if(currentUser.isLibrarian){
        res.render("home-librarian");
    }
    res.render("home");
})

/* Sign In */
app.get("/sign-in", function(req, res){
    res.render("sign-in");
});

app.post("/sign-in", function(req, res){
    const reqUsername = req.body.username;
    const reqPassword = req.body.password;

    User.findOne({username: reqUsername, password: reqPassword}, function(err, user){
        if(user){
            currentUser = user;
            res.redirect("/");
        } else{
            res.render("sign-in");
        }
    })
})

app.get("/sign-out", function(req, res){
    currentUser = null;
    res.redirect("/sign-in")
});

/* Register */
app.get("/register", function(req, res){
    res.render("register");
})

app.post("/register", function(req, res){
    const reqUsername = req.body.username;
    const reqPass = req.body.password;
    const reqFirst = req.body.firstName;
    const reqLast = req.body.lastName;

    User.findOne({username: reqUsername}, function(err, user){
        if(user){
            res.render("register");
        }
        else{
            const newUser = new User({
                username: reqUsername,
                password: reqPass,
                firstName: reqFirst,
                lastName: reqLast,
                isLibrarian: false
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
                keyword: keyword 
            });
        }
    });
});

app.post("/search", function(req, res){
    res.redirect("/search?keyword=" + req.body.keyword);
});

/* View Book */
app.get("/book-info?:bookId", function (req, res){
    if(currentUser.isLibrarian) res.redirect("/book-edit?bookId=" + req.query.bookId);
    Book.findOne({_id: req.query.bookId}, function(err, book){
        if(book){
            res.render("book-info", {book: book});
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
                dateBorrowed: (new Date()).getDate(),
                dateReturned: "Not Returned",
                isReturned: false
            });
            book.save(),
            transaction.save();
            res.render("confirm", {
                title: "Borrowing Book",
                message: "You are now borrowing the book.",
                link: "/"
            });
        } else {
            book.queue.push(currentUser._id);
            book.save(),
            res.render("confirm", {
                title: "Added to queue.",
                message: "This book is currently being borrowed by another patron. You have been added to the queue.",
                link: "/"
            });
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
    
});

app.post("/book-delete?:bookId", function(req, res){
    Book.deleteOne({_id: req.query.bookId}, function(err, book){
        if(err){
            console.log(err);
        } else{
            res.render("confirm", {
                title: "Book Deleted",
                message: "The book has been successfully deleted.",
                link: "/"
            })
        }
    });
});

/* Account Info */
app.get("/account", function(req, res){
    User.findOne({_id: currentUser._id}, function(err, user){
        res.render("account", {
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            password: user.password,
        });
    });
});

app.post("/account", function(req, res){
    User.updateOne({_id: currentUser_id}, {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        username: req.body.username,
        password: req.body.password
    }, function(err, res){

    });
    res.redirect("/account");
})

/* Transactions */
app.get("/transactions", function(req, res){
    if(currentUser.isLibrarian == false) res.redirect("/transaction-history");
    Transaction.find(function(err, transactions){
        res.render("transactions", {results: transactions});
    })
})

app.get("/transaction-history", function(req, res){
    Transaction.find({user: currentUser}, function(err, transactions){
        res.render("transactions", {results: transactions});
    })
})

app.post("/return-book?:transactionId", function(req, res){
    Transaction.findOne({_id: req.query.transactionId}, function(err, transaction){
        transaction.isReturned = true;
        transaction.returnDate = (new Date()).getDate();

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
    
    res.render("confirm",{
        title: "Book Returned",
        message: "The book has been returned.",
        link: "/transactions"
    })
});

app.listen(3000, function() {
  console.log("Server has started successfully");
});