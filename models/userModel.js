import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        minlength: [1, 'Name must be at least 1 character'],
        maxlength: [12, 'Name must be at most 12 characters']
    },
    last_name: {
        type: String,
        required: [true, 'Last Name is required'],
        minlength: [1, 'Last Name must be at least 1 character'],
        maxlength: [32, 'Last Name must be at most 32 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: [true, "Email already taken."] // optional, prevents duplicate emails
    },
    code: {
        type: String,
        required: [true, 'Code is required'],
        unique: [true, "User code already registered."],
        minlength: [1, 'User code must be at least 1 character'],
        maxlength: [6, 'User code must be at most 6 characters']
    },
    cpf: {
        type: String,
        required: [true, 'CPF is required'],
        unique: [true, "CPF already registered."],
        length: [11, 'CPF must be exactly 11 caracters.'],
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