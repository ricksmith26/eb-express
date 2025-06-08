import dotenv from "dotenv";
export const dotEnvConfig = {path: '.env'}
dotenv.config(dotEnvConfig);
export const {
    MONGO_DB_URL,
    API_URL,
    FRONTEND_URL,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL } = process.env;

    console.log({
        MONGO_DB_URL,
        API_URL,
        FRONTEND_URL,
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_CALLBACK_URL })