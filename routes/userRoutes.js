import express from "express"
// importando os controllers de Users
import { getAllUsers, getUser, currentUser, createUser, updateUser, deleteUser } from "../controllers/userController.js";
// importa o middleware de validação do JOI
import { validateJoiSchema } from "../middleware/validateJoiSchema.js";
// importa o schema do JOI
import { userCreateSchema, userUpdateSchema, userSearchSchema } from "../models/joi_models/userValidateModel.js";
// importa middleware de validação jwt
import { validateJwtToken } from "../middleware/validateTokenHandler.js";

// importa o router do express
const router = express.Router();

// valida sessão antes de tudo
router.use(validateJwtToken)

router.get("/", getAllUsers);

router.get("/:id", validateJoiSchema(userSearchSchema, "params"), getUser);

router.get("/current/me", currentUser);

router.post("/", validateJoiSchema(userCreateSchema, "body"), createUser);

router.patch("/:id", validateJoiSchema(userSearchSchema, "params"), validateJoiSchema(userUpdateSchema, "body"), updateUser);

router.delete("/:id", validateJoiSchema(userSearchSchema, "params"), deleteUser);

export default router