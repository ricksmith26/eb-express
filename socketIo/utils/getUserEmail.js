import { users } from "../socketIo.js";

export function getUserEmail(socketId) {
    for (const [email, id] of users.entries()) {
      if (id === socketId) return email;
    }
    return null;
  }