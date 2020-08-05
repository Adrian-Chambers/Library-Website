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
    })
})

app.get("/sign-out", function(req, res){
    currentUser = null;
    res.redirect("/sign-in")
});

/* Register */
app.get("/register", function(req, res){
    res.render("register", {error: ""});
})

app.post("/register", function(req, res){
    const reqUsername = req.body.username;
    const reqPass = req.body.password;
    const reqFirst = req.body.firstName;
    const reqLast = req.body.lastName;

    User.findOne({username: reqUsername}, function(err, user){
        if(user){
            res.render("register", {error: "Username already taken"});
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
            if(currentUser.isLibrarian){
                res.render("search-librarian",{
                    results: books, 
                    keyword: keyword 
                })
            } else {
                res.render("search", { 
                    results: books, 
                    keyword: keyword 
                });
            }
            
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
                borrowDate: date.getMonth() + "-" + date.getDate() + "-" + date.getFullYear(),
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

    res.render("confirm-librarian", {
        title: "Book Edited",
        message: "Your book has been edited",
        link: "/"
    });
});

app.post("/book-delete?:bookId", function(req, res){
    Book.deleteOne({_id: req.query.bookId}, function(err, book){
        if(err){
            console.log(err);
        } else{
            res.render("confirm-librarian", {
                title: "Book Deleted",
                message: "The book has been successfully deleted.",
                link: "/"
            })
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
    res.render("confirm-librarian", {
        title: "Book Created",
        message: "Your book has been created",
        link: "/"
    })
});

/* Account */
app.get("/account", function(req, res){
    res.render("account", {
        user: currentUser,
        error: ""
    });
});

app.post("/account", function(req, res){
    User.findOne({username: req.body.username}, function(err, user){
        if(user){
            res.render("account", {user: currentUser, error: "Username already taken"});
        }
        else{
            User.updateOne({_id: currentUser._id}, {
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                username: req.body.username,
                password: req.body.password
            }, function(err, res){
    
            });
            res.render("confirm", {
                title: "Account Updated",
                message: "Your account information has been updated.",
                link: "/account"
            });
        }
    });
})

app.get("/account-edit?:userId", function(req, res){
    User.findOne({_id: req.query.userId}, function(err, user){
        res.render("account-edit", {
            user: user,
            error: ""
        });
    });
});

app.post("/account-edit?:userId", function(req, res){
    User.findOne({_id: req.query.userId}, function(err, user){
        User.findOne({username: req.body.username}, function(err, user2){
            if(user2){
                res.render("account-edit", {user: user, error: "Username already taken"})
            }
            else{
                user.firstName = req.body.firstName;
                user.lastName = req.body.lastName;
                user.username = req.body.username;
                user.password = req.body.password;
                user.save();
                res.render("confirm", {
                    title: "Account Updated",
                    message: "Your account information has been updated.",
                    link: "/users",
                });
            }
        });
    });
});

app.post("/account-delete?:userId", function(req, res){
    User.deleteOne({_id: req.query.userId}, function(err, user){
        if(err){
            console.log(err);
        } else{
            res.render("confirm-librarian", {
                title: "User Deleted",
                message: "Your account has been successfully deleted.",
                link: "/"
            })
        }
    });
})

app.get("/account-create", function(req, res){
    res.render("account-create", {error: ""});
});

app.post("/account-create", function(req, res){
    User.findOne({username: req.body.username}, function(err, user){
        if(user){
            res.render("account-create", {error: "Username already taken"});
        } else{
            const user = new User({
                username: req.body.username,
                password: req.body.password,
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                isLibrarian: false
            });
            user.save();
            res.render("confirm-librarian", {
                title: "Account created",
                message: "The account has been created",
                link: "/"
            })
        }
    })
})

/* Transactions */
app.get("/transactions", function(req, res){
    if(currentUser.isLibrarian == false) res.redirect("/transaction-history");
    Transaction.find(function(err, transactions){
        res.render("transactions", {results: transactions});
    })
})

app.post("/transactions", function(req, res){
    User.find({username: req.body.keyword}, function(err, user){
        Transaction.find({user: user}, function(err, result){
            res.render("transactions", {results: result});
        });
    });
});

app.get("/transaction-history", function(req, res){
    Transaction.find({user: currentUser}, function(err, transactions){
        res.render("transaction-history", {results: transactions});
    })
})

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
    
    res.render("confirm",{
        title: "Book Returned",
        message: "The book has been returned.",
        link: "/transactions"
    })
});

/* Users */
app.get("/users", function(req, res){
    User.find(function(err, user){
        res.render("users", {results: user});
    });
});

app.post("/users", function(req, res){
    const keyword = req.body.keyword;
    User.find({username: keyword}, function(err, user){
        res.render("users", {results: user});
    });
});



app.listen(3000, function() {
    console.log("Server has started successfully");
});