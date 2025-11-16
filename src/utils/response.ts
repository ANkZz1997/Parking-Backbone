import { Response } from 'express';


type Data = Record<string, any> | null;


export const OK = (
    res: Response,
    data: Data = null,
    message: any = "Success",
    statusCode = 200
) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
    });
};

export const CREATED = (
    res: Response,
    data: Data = null,
    message: any = "Created"
) => {
    return res.status(201).json({
        success: true,
        message,
        data,
    });
};

export const BADREQUEST = (
    res: Response,
    message: any = "Bad request",
) => {
    return res.status(400).json({
        success: false,
        message,
    });
};

export const UNAUTHORIZED = (
    res: Response,
    message: any = "Unauthorized",
) => {
    return res.status(401).json({
        success: false,
        message,
    });
};

export const FORBIDDEN = (
    res: Response,
) => {
    return res.status(403).json({
        success: false,
        message: "Forbidden",
    });
};

export const NOT_FOUND = (
    res: Response,
) => {
    return res.status(404).json({
        success: false,
        message: "Not found",
    });
};

export const CONFLICT = (
    res: Response,
) => {
    return res.status(409).json({
        success: false,
        message: "Conflict",
    });
};

export const INVALID = (
    res: Response,
    errors: any,
) => {
    return res.status(422).json({
        success: false,
        message: "Invalid",
        errors,
    });
};

export const INTERNAL_SERVER_ERROR = (
    res: Response,
    message?: string
) => {
    return res.status(500).json({
        success: false,
        message: message || "Internal server error",
    });
};
