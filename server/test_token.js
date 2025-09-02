import jwt from "jsonwebtoken"; const token = jwt.sign({userId: "test", email: "jaehoon@interactor.com"}, process.env.JWT_SECRET || "your-secret-key-here", {expiresIn: "1h"}); console.log(token);
