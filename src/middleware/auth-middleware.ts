import { Request, Response, NextFunction } from 'express';
import { INTERNAL_SERVER_ERROR, UNAUTHORIZED } from '../utils/response';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { configDotenv } from 'dotenv';
import { userModel } from '../models/user-schema';

configDotenv();


export default async function checkAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return UNAUTHORIZED(res, "invalidToken");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;

    if (!decoded) {
      return UNAUTHORIZED(res, "Invalid token");
    }

    const checkUser = await userModel.findOne({ _id: decoded.userId, isDeleted: false, isBlocked: false });

    if (!checkUser) {
      return UNAUTHORIZED(res, "User not found");
    }

    (req as any).user = decoded;

    next();
  } catch (error: any) {
    const customeMessage = error.message as string
    return INTERNAL_SERVER_ERROR(res, customeMessage);
  }
}

