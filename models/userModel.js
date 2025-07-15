import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Name is required'],
        unique: [true, "Name already exist."],
        minlength: [1, 'Name must be at least 1 character'],
        maxlength: [12, 'Name must be at most 12 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: [true, "Email already taken."] // optional, prevents duplicate emails
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters'],
        maxlength: [60, 'Password must be at max 8 characters']
    },
    role: { 
        type: String, 
        enum: ["user", "driver", "admin"],
        default: "user"
    },
});

export const User = mongoose.model("User", userSchema);