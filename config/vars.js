import dotenv from "dotenv";
export const dotEnvConfig = {path: '.env.local'}
dotenv.config(dotEnvConfig);
export const {
    MONGO_DB_URL,
    API_URL,
    FRONTEND_URL,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL,
    WITHINGS_CLIENT_ID,
    WITHINGS_CLIENT_SECRET,
    WITHINGS_CALLBACK_URL,
    AGENT_API_KEY
} = process.env;

console.log({
    MONGO_DB_URL,
    API_URL,
    FRONTEND_URL,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL,
    WITHINGS_CLIENT_ID,
    WITHINGS_CLIENT_SECRET,
    WITHINGS_CALLBACK_URL
})